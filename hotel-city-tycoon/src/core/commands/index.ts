/**
 * Commands are the only way the outside world changes the simulation.
 *
 * React never mutates state. It sends one of these, the core validates it
 * against the balance data, and either applies it or rejects it with a typed
 * reason the UI can turn into a clear message. Logging commands gives replay,
 * cheat detection and analytics for free.
 */
import type { SimData } from '../data-source.ts';
import { roomDef, shiftDef, roomById } from '../data-source.ts';
import type { GameState, SimEvent } from '../state/types.ts';
import { makeRoom } from '../state/init.ts';
import { findFreeSpot, contains, footprintOf, placementProblemAt } from '../state/grid.ts';
import { canAfford, pay, spend, earn, totalShiftCost, shiftWages, shiftUpkeep, isOpen } from '../systems/economy.ts';
import { computeDecorPoints } from '../systems/decor.ts';
import { computeStars, tierFor } from '../systems/stars.ts';
import { grantXp, isUnlocked } from '../systems/progression.ts';
import { clearHazard } from '../systems/events.ts';
import { queueCapacity, receptionEfficiency } from '../systems/guests.ts';
import { owned, grant, consume, sellValue } from '../systems/inventory.ts';
import { slotAllowed } from '../systems/quality.ts';
import { anchorKey, firstFreeAnchor, roomBandsFor } from '../systems/decorPlacement.ts';
import { Rng } from '../rng/index.ts';
import { nextTier } from '../systems/upgrades.ts';
import { shopOffers, shopPeriod, isOfferTaken, giftState, weekIndexOf, activeSeason } from '../systems/liveops.ts';
import { neighbours, visitsLeft, canVisit, recordVisit } from '../systems/neighbours.ts';
import { isObjectiveComplete } from '../systems/objectives.ts';

export type Command =
  /** Omit x/y to let the game place the room in the first free spot. */
  | { type: 'BUILD_ROOM'; defId: string; x?: number; y?: number }
  | { type: 'SELL_ROOM'; roomId: string }
  | { type: 'PLACE_DECOR'; roomId: string; defId: string; slot: number }
  | { type: 'REMOVE_DECOR'; roomId: string; decorId: string }
  | { type: 'START_SHIFT'; shiftId: string }
  | { type: 'CLEAR_HAZARD'; roomId: string; hazard: 'pest' | 'fire' }
  | { type: 'EXPAND_PLOT'; plotId: string }
  | { type: 'HIRE_STAFF'; roomId: string; roleId: string }
  | { type: 'DRAG_GUEST'; guestId: string }
  | { type: 'TAP_GUEST'; guestId: string }
  | { type: 'CLAIM_OBJECTIVE'; objectiveId: string }
  | { type: 'BUY_UPGRADE'; upgradeId: string }
  /** Buying from the rotating shop. The period is checked, not trusted. */
  | { type: 'BUY_SHOP_OFFER'; defId: string; epochMs: number }
  | { type: 'CLAIM_GIFT'; epochMs: number }
  | { type: 'VISIT_NEIGHBOUR'; neighbourId: string; epochMs: number }
  /** Sell one unplaced copy back. Removal and selling are separate acts. */
  | { type: 'SELL_DECOR'; defId: string }
  /** Pick a built room up and put it down somewhere else on the plot. */
  | { type: 'MOVE_ROOM'; roomId: string; x: number; y: number }
  /** Take a room down and keep it, with its decor and condition intact. */
  | { type: 'STORE_ROOM'; roomId: string }
  /** Put a stored room back. Omit x/y for the first free spot. */
  | { type: 'PLACE_STORED_ROOM'; roomId: string; x?: number; y?: number }
  | { type: 'ASSIGN_STAFF'; staffId: string; roomId: string }
  | { type: 'UNASSIGN_STAFF'; staffId: string }
  | { type: 'FIRE_STAFF'; staffId: string }
  | { type: 'RENAME_HOTEL'; name: string }
  /** 4C: the phone. The ghostbuster clears every haunting; repair ends the weather. */
  | { type: 'CALL_SERVICE'; service: 'ghostbuster' | 'repair' };

export type RejectReason =
  | 'unknownRoom' | 'unknownDecor' | 'unknownShift' | 'unknownPlot'
  | 'notUnlocked' | 'cannotAfford' | 'noSpace' | 'slotTaken'
  | 'roomLimitReached' | 'decorLimitReached' | 'alreadyOpen'
  | 'noSuchHazard' | 'roomOccupied' | 'plotTooSmall' | 'invalidName'
  | 'roleMismatch' | 'slotFilled' | 'outOfBounds' | 'overlaps' | 'alreadyExists'
  | 'unknownGuest' | 'guestNotDraggable' | 'queueFull' | 'dragDisabled'
  | 'unknownObjective' | 'notComplete' | 'alreadyClaimed'
  | 'alreadyRevealed' | 'guestNotResting' | 'nothingToFix'
  | 'unknownUpgrade' | 'fullyUpgraded'
  | 'offerExpired' | 'offerTaken' | 'giftNotReady'
  | 'unknownNeighbour' | 'alreadyVisited' | 'noVisitsLeft'
  | 'hotelClosed' | 'dragOnCooldown' | 'unknownCommand' | 'noReceptionist'
  | 'notOwned' | 'notRefundable'
  | 'unknownStaff' | 'roomHasHazard' | 'roomTooDirty' | 'roomRequired'
  | 'notStored' | 'sameSpot' | 'storageFull' | 'slotIncompatible' | 'notNextPlot';

export type CommandResult =
  | { ok: true; events: SimEvent[] }
  | { ok: false; reason: RejectReason };

const reject = (reason: RejectReason): CommandResult => ({ ok: false, reason });

/**
 * Applies one command. Mutates `state` only on success — a rejected command
 * leaves the state byte-identical, which the determinism test relies on.
 */
export function execute(data: SimData, state: GameState, cmd: Command): CommandResult {
  const out: SimEvent[] = [];

  switch (cmd.type) {
    case 'BUILD_ROOM': {
      const def = roomById(data, cmd.defId);
      if (!def) return reject('unknownRoom');
      if (def.unlockLevel > state.player.level) return reject('notUnlocked');
      if (state.hotel.rooms.length >= data.economy.limits.maxRoomsPerHotel) return reject('roomLimitReached');
      // A hotel has one lobby. The data has always said so; nothing read it.
      if ('unique' in def && def.unique && state.hotel.rooms.some((r) => r.defId === def.id)) {
        return reject('alreadyExists');
      }
      if (!canAfford(state, def.cost)) return reject('cannotAfford');

      // Placement is checked against the actual grid, not just a block total.
      // A block budget alone let rooms be stacked on the same coordinate.
      let px = cmd.x;
      let py = cmd.y;
      if (px === undefined || py === undefined) {
        const spot = findFreeSpot(data, state, def.blocks);
        if (!spot) return reject('noSpace');
        px = spot.x;
        py = spot.y;
      }
      const problem = placementProblemAt(data, state, cmd.defId, px, py);
      if (problem !== null) return reject(problem);

      pay(state, def.cost, 'roomBuild');
      const room = makeRoom(state, cmd.defId, px, py);
      state.hotel.rooms.push(room);
      grantXp(data, state, Math.round(def.cost.amount * data.economy.xp.grantOnRoomBuild), out);
      refreshStars(data, state, out);
      return { ok: true, events: out };
    }

    case 'SELL_ROOM': {
      const room = state.hotel.rooms.find((r) => r.id === cmd.roomId);
      if (!room) return reject('unknownRoom');
      if (room.occupants.length > 0) return reject('roomOccupied');
      // A burning room cannot be sold out from under the fire. Selling was the
      // one hazard exit that cost nothing: the refund arrived, the incident
      // vanished, and clearing it properly was strictly worse value. The
      // ghost joined the list late (4C added it, this check was not updated):
      // selling a haunted room paid a third of its price AND skipped the
      // ghostbuster's fee.
      if (room.hasFire || room.hasPest || room.hasGhost) return reject('roomHasHazard');
      const def = roomDef(data, room.defId);
      if ('required' in def && def.required) return reject('roomRequired');

      // The room refunds; its decor comes back to the player instead. Selling
      // a room used to liquidate everything in it at a third of face value,
      // which quietly turned gem-priced decor into coins and made rebuilding
      // elsewhere cost the full price again.
      const refund = Math.round(def.cost.amount * data.economy.sellback.ratio);
      for (const placed of room.decor) grant(state, placed.defId);
      earn(state, refund, 'roomSellback');
      state.hotel.rooms = state.hotel.rooms.filter((r) => r.id !== room.id);
      // Mutated in place, like every other staff path. Replacing the objects
      // left any reference taken before the sale pointing at a room that no
      // longer exists, which is the sort of split-brain that only shows up
      // later and somewhere else.
      for (const member of state.staff) {
        if (member.roomId === room.id) {
          member.roomId = null;
          out.push({ type: 'staffUnassigned', staffId: member.id });
        }
      }
      refreshStars(data, state, out);
      return { ok: true, events: out };
    }

    case 'PLACE_DECOR': {
      const room = state.hotel.rooms.find((r) => r.id === cmd.roomId);
      if (!room) return reject('unknownRoom');
      const def = data.decor.find((d) => d.id === cmd.defId);
      if (!def) return reject('unknownDecor');
      if (def.unlockLevel > state.player.level) return reject('notUnlocked');

      const rdef = roomDef(data, room.defId);
      if (cmd.slot < 0 || cmd.slot >= rdef.decorSlots) return reject('noSpace');
      if (room.decor.length >= data.economy.limits.maxDecorPerRoom) return reject('decorLimitReached');
      if (room.decor.some((p) => p.slot === cmd.slot)) return reject('slotTaken');
      // A bed belongs in a bedroom. Nothing stopped one being installed in the
      // laundry, where it counted towards the rating just the same.
      if (!slotAllowed(data, rdef, cmd.defId)) return reject('slotIncompatible');

      // Spend a copy the player already owns before spending their money.
      // Every validation above has passed, so consuming here cannot leave the
      // store short of an item that then fails to be placed.
      const fromStore = consume(state, cmd.defId);
      if (!fromStore) {
        if (!canAfford(state, def.cost)) return reject('cannotAfford');
        pay(state, def.cost, 'decorBuy');
      }

      // DEC-010: a freshly placed piece needs somewhere to stand, not just a
      // slot index. The room's own current pieces are what it must not land
      // on top of; slotType picks which surface band it prefers.
      const bounds = roomBandsFor(data, room.defId);
      const takenAnchors = new Set(room.decor.map((p) => anchorKey(p.localX, p.localY)));
      const anchor = firstFreeAnchor(bounds, def.category, def.slotType, takenAnchors);
      room.decor.push({
        id: `d${state.counters.decor++}`, defId: cmd.defId, slot: cmd.slot,
        localX: anchor.x, localY: anchor.y, flipX: false, zBias: 0,
      });
      room.decorPoints = computeDecorPoints(data, room);
      // XP is for the purchase, not for moving a piece between rooms. Paying it
      // on a stored item would make take-down-and-replace an XP tap.
      if (!fromStore) {
        grantXp(data, state, Math.round(def.cost.amount * data.economy.xp.grantOnDecorPlace), out);
      }
      refreshStars(data, state, out);
      return { ok: true, events: out };
    }

    case 'REMOVE_DECOR': {
      const room = state.hotel.rooms.find((r) => r.id === cmd.roomId);
      if (!room) return reject('unknownRoom');
      const placed = room.decor.find((p) => p.id === cmd.decorId);
      if (!placed) return reject('unknownDecor');
      // Taking a piece down returns it to the player. It used to sell it for
      // a third of its price instead, so there was no way to rearrange a room
      // without destroying its contents — and a piece bought with gems was
      // silently converted into coins on the way out.
      room.decor = room.decor.filter((p) => p.id !== cmd.decorId);
      grant(state, placed.defId);
      room.decorPoints = computeDecorPoints(data, room);
      refreshStars(data, state, out);
      return { ok: true, events: out };
    }

    case 'START_SHIFT': {
      const def = data.shifts.find((s) => s.id === cmd.shiftId);
      if (!def) return reject('unknownShift');
      if (def.unlockLevel > state.player.level) return reject('notUnlocked');
      if (isOpen(state)) return reject('alreadyOpen');
      // The lobby has declared `staffRole: receptionist` since the first data
      // file. Whether an empty desk stops the shift or merely slows it is a
      // data decision, not a hardcoded one.
      if (receptionEfficiency(data, state) <= 0) return reject('noReceptionist');

      const cost = totalShiftCost(data, state, cmd.shiftId);
      if (state.player.coins < cost) return reject('cannotAfford');

      // Split so the ledger can tell a shift's base cost from its payroll.
      const wages = shiftWages(data, state, cmd.shiftId);
      const upkeep = shiftUpkeep(data, state, cmd.shiftId);
      spend(state, cost - wages - upkeep, 'shiftCost');
      spend(state, wages, 'wages');
      spend(state, upkeep, 'upkeep');
      state.shift.activeShiftId = cmd.shiftId;
      state.stats.shiftsOpened++;
      state.shift.paidCost = cost;
      const tps = data.economy.simulation.ticksPerSecond;
      state.shift.endsAtTick = state.tick + shiftDef(data, cmd.shiftId).durationSec * tps;
      state.shift.graceEndsAtTick = state.shift.endsAtTick + Math.round(data.graceSec * tps);
      out.push({ type: 'shiftStarted', shiftId: cmd.shiftId, cost, endsAtTick: state.shift.endsAtTick });
      return { ok: true, events: out };
    }

    case 'CLEAR_HAZARD': {
      const room = state.hotel.rooms.find((r) => r.id === cmd.roomId);
      if (!room) return reject('unknownRoom');
      const present = cmd.hazard === 'pest' ? room.hasPest : room.hasFire;
      if (!present) return reject('noSuchHazard');

      const ev = data.events.find((e) => e.id === cmd.hazard);
      const price = ev?.clearCost;
      if (price && price.amount > 0) {
        if (!canAfford(state, price)) return reject('cannotAfford');
        pay(state, price, 'hazardRepair');
      }
      clearHazard(data, state, room, cmd.hazard, out);
      refreshStars(data, state, out);
      return { ok: true, events: out };
    }

    case 'EXPAND_PLOT': {
      const plot = data.plots.find((p) => p.id === cmd.plotId);
      if (!plot) return reject('unknownPlot');
      if (plot.unlockLevel > state.player.level) return reject('notUnlocked');
      const current = data.plots.find((p) => p.id === state.hotel.plotId);
      if (current && plot.blocks <= current.blocks) return reject('plotTooSmall');

      /*
       * The next plot up, and only that one.
       *
       * Any larger plot was accepted, so a player at plot_12 with enough coins
       * could buy plot_180 outright and skip every expansion in between —
       * paying once for ground they should have bought in steps, and stepping
       * over the level gates on each intermediate plot.
       */
      const step = data.plots
        .filter((p) => p.blocks > (current?.blocks ?? 0))
        .sort((a, b) => a.blocks - b.blocks)[0];
      if (!step || step.id !== plot.id) return reject('notNextPlot');

      // A block total is not a shape. A plot with more blocks can still be
      // narrower or shorter than the one it replaces, which would leave rooms
      // hanging outside the buildable area. Check the actual rectangle.
      const bounds = { x: 0, y: 0, w: plot.grid.w, h: plot.grid.h };
      for (const room of state.hotel.rooms) {
        if (!contains(bounds, footprintOf(data, room))) return reject('plotTooSmall');
      }

      if (state.player.coins < plot.cost) return reject('cannotAfford');

      spend(state, plot.cost, 'plotExpansion');
      state.hotel.plotId = plot.id;
      out.push({ type: 'plotExpanded', plotId: plot.id, cost: plot.cost });
      return { ok: true, events: out };
    }

    case 'HIRE_STAFF': {
      const room = state.hotel.rooms.find((r) => r.id === cmd.roomId);
      if (!room) return reject('unknownRoom');
      const rdef = roomDef(data, room.defId);
      const wanted = 'staffRole' in rdef ? rdef.staffRole : null;
      if (!wanted || wanted !== cmd.roleId) return reject('roleMismatch');
      if (room.staffId) return reject('slotFilled');

      const role = data.staffRoles.find((r) => r.id === cmd.roleId);
      if (!role) return reject('roleMismatch');
      if (role.unlockLevel > state.player.level || !isUnlocked(data, state, 'staffRole', role.id)) return reject('notUnlocked');
      if (state.player.coins < role.hireCost) return reject('cannotAfford');

      spend(state, role.hireCost, 'staffHire');

      // Who turns up is a draw against the declared weights. Those weights sat
      // in the data unused while every single hire was bronze, which made the
      // whole grade system decoration: silver and gold existed, cost more in
      // wages, and could never be obtained.
      const rng = new Rng(state.seed, state.rng);
      const grade = rng.weighted('staffGrade', data.staffGrades, (g) => g.weight)
        ?? data.staffGrades[0];
      state.rng = rng.snapshot();

      const id = `s${state.counters.staff++}`;
      state.staff.push({ id, roleId: cmd.roleId, gradeId: grade?.id ?? 'bronze', roomId: room.id });
      room.staffId = id;
      out.push({ type: 'staffHired', staffId: id, roleId: cmd.roleId, gradeId: grade?.id ?? 'bronze' });
      return { ok: true, events: out };
    }

    case 'DRAG_GUEST': {
      // The one interaction that rewards being present rather than idle:
      // a guest walking past can be pulled back to reception by hand.
      if (!data.economy.guests.dragToLobbyEnabled) return reject('dragDisabled');
      // The hotel has to be open to take anybody in. Dragging someone back
      // into a closed lobby was a way to check guests in past the shift.
      if (!isOpen(state)) return reject('hotelClosed');

      const tps = data.economy.simulation.ticksPerSecond;
      // The data has declared a cooldown since P1 and nothing read it, so the
      // interaction was a button that could be held down.
      const cooldownTicks = Math.round(data.economy.guests.dragToLobbyCooldownSec * tps);
      if (state.lastDragTick >= 0 && state.tick - state.lastDragTick < cooldownTicks) {
        return reject('dragOnCooldown');
      }

      const guest = state.guests.find((g) => g.id === cmd.guestId);
      if (!guest) return reject('unknownGuest');
      // Only someone who never got a room. `leaving` also covers a guest who
      // has already checked out and paid, and re-queuing one of those had them
      // check in and pay a second time.
      if (guest.everCheckedIn) return reject('guestNotDraggable');
      if (guest.state !== 'arriving' && guest.state !== 'leaving') return reject('guestNotDraggable');
      if (state.lobbyQueue.includes(guest.id)) return reject('guestNotDraggable');
      if (state.lobbyQueue.length >= queueCapacity(data, state)) return reject('queueFull');

      const type = data.guestTypes.find((t) => t.id === guest.typeId);
      guest.state = 'queued';
      guest.stateSinceTick = state.tick;
      // Patience resets: they were persuaded to stay, not merely detained.
      guest.patienceUntilTick = state.tick + Math.round((type?.patienceSec ?? 60) * tps);
      state.lobbyQueue.push(guest.id);
      state.lastDragTick = state.tick;
      // `guestsLost` used to be decremented here. It is a lifetime counter, and
      // the guest being rescued was not necessarily the one it counted — a
      // rescue could quietly cancel out somebody else's walk-away.
      return { ok: true, events: out };
    }

    case 'TAP_GUEST': {
      // The original game hid inspectors among sleeping guests and let players
      // find them by clicking. It is the purest reward for being present
      // rather than idle, and the data has described it since P1 while nothing
      // read those fields.
      const guest = state.guests.find((g) => g.id === cmd.guestId);
      if (!guest) return reject('unknownGuest');
      if (guest.state !== 'staying' && guest.state !== 'usingAmenity') return reject('guestNotResting');
      if (state.revealedGuests.includes(guest.id)) return reject('alreadyRevealed');

      state.revealedGuests.push(guest.id);

      const type = data.guestTypes.find((t) => t.id === guest.typeId);
      if (type?.special !== 'inspector') {
        // Decision 3a: poking a SLEEPING guest pays a uniform 400..500, once
        // per guest (revealedGuests, pushed above) and capped per day. A
        // guest in an amenity is awake — nothing to poke.
        const poke = data.economy.poke;
        const today = Math.floor(state.epochMs / 86_400_000);
        if (state.pokes.day !== today) state.pokes = { day: today, count: 0 };
        if (guest.state === 'staying' && state.pokes.count < poke.dailyCap) {
          state.pokes.count++;
          const rng = new Rng(state.seed, state.rng);
          const coins = rng.int('poke', poke.minCoins, poke.maxCoins);
          state.rng = rng.snapshot();
          earn(state, coins, 'eventReward');
          out.push({ type: 'guestPoked', guestId: guest.id, coins });
          return { ok: true, events: out };
        }
        out.push({ type: 'nothingFound', guestId: guest.id });
        return { ok: true, events: out };
      }

      const def = data.events.find((e) => e.id === 'inspection');
      const coins = Math.round(Number(def?.['rewardCoinsPerStar'] ?? 0) * state.hotel.stars);
      const xp = Number(def?.['rewardXp'] ?? 0);
      const boost = def?.['temporaryStarBoost'] as { amount?: number; durationSec?: number } | undefined;

      earn(state, coins, 'eventReward');
      grantXp(data, state, xp, out);

      if (boost?.amount) {
        state.starBoost = {
          amount: boost.amount,
          untilTick: state.tick
            + Math.round((boost.durationSec ?? 0) * data.economy.simulation.ticksPerSecond),
        };
      }
      out.push({ type: 'inspectorFound', guestId: guest.id, coins, xp, boost: boost?.amount ?? 0 });
      return { ok: true, events: out };
    }

    case 'BUY_SHOP_OFFER': {
      // The offer is recomputed here rather than taken from the caller: the
      // price is derived from the seed and the week, so the core can check it
      // for itself and a client cannot invent a discount.
      const period = shopPeriod(data, cmd.epochMs);
      const offer = shopOffers(data, state, cmd.epochMs).find((o) => o.defId === cmd.defId);
      if (!offer) return reject('offerExpired');
      if (isOfferTaken(state, period, cmd.defId)) return reject('offerTaken');
      if (!canAfford(state, { currency: offer.currency, amount: offer.price })) {
        return reject('cannotAfford');
      }

      pay(state, { currency: offer.currency, amount: offer.price }, 'shopPurchase');
      // The purchase and the record of it happen together. Marking the offer
      // taken without granting the item is what made the shop a donation box.
      grant(state, cmd.defId);
      state.shopTaken[`${period}:${cmd.defId}`] = true;
      out.push({
        type: 'shopPurchase',
        defId: cmd.defId,
        price: offer.price,
        saved: offer.fullPrice - offer.price,
      });
      return { ok: true, events: out };
    }

    case 'VISIT_NEIGHBOUR': {
      if (!neighbours(data, state, cmd.epochMs).some((n) => n.id === cmd.neighbourId)) {
        return reject('unknownNeighbour');
      }
      if (visitsLeft(data, state, cmd.epochMs) <= 0) return reject('noVisitsLeft');
      if (!canVisit(data, state, cmd.epochMs, cmd.neighbourId)) return reject('alreadyVisited');

      recordVisit(state, cmd.epochMs, cmd.neighbourId);
      // 4A: a visit collects a MONEY BAG at the star-tier value from decision
      // 1a (400/415/430). 19 visits plus the daily home bonus make the
      // original snapshot's twenty bags a day.
      const coins = tierFor(data, state.hotel.stars).dailyBonusCoins;
      const { xp } = data.neighbours.visitReward;
      earn(state, coins, 'socialReward');
      grantXp(data, state, xp, out);
      out.push({ type: 'neighbourVisited', neighbourId: cmd.neighbourId, coins, xp });
      return { ok: true, events: out };
    }

    case 'CLAIM_GIFT': {
      const gift = giftState(data, state, cmd.epochMs);
      if (!gift.available) return reject('giftNotReady');

      // The same period arithmetic the gift state uses, from the same field.
      const periodMs = Math.max(1, data.gifts.resetHours) * 3_600_000;
      const today = Math.floor(cmd.epochMs / periodMs);

      // 4B, decision 15a: no coin streak. The daily claim IS the home money
      // bag — the star bonus below — and on a new week the catalogue's free
      // item rides along, the original's weekly gift made single-player.
      let itemDefId: string | null = null;
      const week = weekIndexOf(data, cmd.epochMs);
      if (week > state.gift.lastItemWeek) {
        itemDefId = gift.itemDefId;
        grant(state, itemDefId);
      }
      state.gift = {
        lastClaimedDay: today,
        lastItemWeek: itemDefId ? week : state.gift.lastItemWeek,
      };

      /*
       * The star bonus rides along with the gift claim.
       *
       * Every tier in stars.json has promised `dailyBonusCoins` since the
       * first data file — 400 at one star up to 3,500 at five — and nothing
       * ever paid it. Keyed by the same period as the gift, so opening the
       * game twice in a day pays it once, and a returning player who has
       * missed a week is paid for today rather than for the week.
       */
      if (state.lastStarBonusDay !== today) {
        state.lastStarBonusDay = today;
        const tier = tierFor(data, state.hotel.stars);
        const bonus = tier.dailyBonusCoins ?? 0;
        if (bonus > 0) {
          earn(state, bonus, 'starBonus');
          out.push({ type: 'starBonusPaid', stars: tier.stars, coins: bonus });
        }

        /*
         * A season's gems ride the same claim and the same key.
         *
         * `dailyGems` has been on every season since P1 and nothing read it,
         * so a season was only ever an income multiplier — the one thing the
         * brief said a season should not be on its own. Paying it here means
         * it is idempotent for free: the day is already closed above.
         */
        const season = activeSeason(data, cmd.epochMs);
        const seasonGems = season?.dailyGems ?? 0;
        if (seasonGems > 0) {
          state.player.gems += seasonGems;
          out.push({ type: 'seasonGemsPaid', seasonId: season!.id, gems: seasonGems });
        }
      }
      out.push({ type: 'giftClaimed', itemDefId });
      return { ok: true, events: out };
    }

    case 'BUY_UPGRADE': {
      const def = data.upgrades.find((u) => u.id === cmd.upgradeId);
      if (!def) return reject('unknownUpgrade');
      if (def.unlockLevel > state.player.level) return reject('notUnlocked');

      const next = nextTier(data, state, cmd.upgradeId);
      if (!next) return reject('fullyUpgraded');
      if (state.player.coins < next.cost) return reject('cannotAfford');

      spend(state, next.cost, 'upgrade');
      state.stats.coinsSpent += next.cost;
      state.upgrades[cmd.upgradeId] = next.index;
      out.push({ type: 'upgradeBought', upgradeId: cmd.upgradeId, tier: next.index, cost: next.cost });
      return { ok: true, events: out };
    }

    case 'CALL_SERVICE': {
      // 4C, the original's phone menu: the ghost is never cleared by tapping
      // the room — you call the ghostbuster; the weather is never waited out
      // by choice — you call the repair crew, or let it pass on its own.
      if (cmd.service === 'ghostbuster') {
        const def = data.events.find((e) => e.id === 'ghost');
        const haunted = state.hotel.rooms.filter((r) => r.hasGhost);
        if (!def || haunted.length === 0) return reject('nothingToFix');
        const price = def.clearCost ?? { currency: 'coins' as const, amount: 0 };
        if (!canAfford(state, price)) return reject('cannotAfford');
        pay(state, price);
        for (const room of haunted) room.hasGhost = false;
        state.stats.ghostsCleared += haunted.length;
        state.eventClearCounts['ghost'] = (state.eventClearCounts['ghost'] ?? 0) + haunted.length;
        const xp = def.clearRewardXp ?? 0;
        if (xp > 0) grantXp(data, state, xp, out);
        out.push({ type: 'serviceCalled', service: 'ghostbuster', coins: price.amount, cleared: haunted.length });
        return { ok: true, events: out };
      }

      const active = state.climate && state.tick < state.climate.untilTick ? state.climate : null;
      if (!active) return reject('nothingToFix');
      const def = data.events.find((e) => e.id === active.eventId);
      const price = def?.clearCost ?? { currency: 'coins' as const, amount: 0 };
      if (!canAfford(state, price)) return reject('cannotAfford');
      pay(state, price);
      out.push({ type: 'climateEnded', eventId: active.eventId, repaired: true });
      state.climate = null;
      out.push({ type: 'serviceCalled', service: 'repair', coins: price.amount, cleared: 1 });
      return { ok: true, events: out };
    }

    case 'CLAIM_OBJECTIVE': {
      // The core measures completion itself rather than believing a number
      // from the UI. An earlier version took the caller's word for it, which
      // would have let any client claim any reward at any time.
      const def = data.objectives.find((o) => o.id === cmd.objectiveId);
      if (!def) return reject('unknownObjective');
      if (state.completedObjectives.includes(cmd.objectiveId)) return reject('alreadyClaimed');
      if (!isObjectiveComplete(data, state, cmd.objectiveId)) return reject('notComplete');

      state.completedObjectives.push(cmd.objectiveId);
      earn(state, def.rewardCoins, 'objectiveReward');
      state.player.gems += def.rewardGems;
      return { ok: true, events: out };
    }

    case 'SELL_DECOR': {
      const def = data.decor.find((d) => d.id === cmd.defId);
      if (!def) return reject('unknownDecor');
      if (owned(state, cmd.defId) <= 0) return reject('notOwned');
      const value = sellValue(data, def);
      if (!value) return reject('notRefundable');

      consume(state, cmd.defId);
      if (value.currency === 'gems') state.player.gems += value.amount;
      else {
        earn(state, value.amount, 'decorSellback');
      }
      out.push({ type: 'decorSold', defId: cmd.defId, currency: value.currency, amount: value.amount });
      return { ok: true, events: out };
    }

    case 'MOVE_ROOM': {
      const room = state.hotel.rooms.find((r) => r.id === cmd.roomId);
      if (!room) return reject('unknownRoom');
      // One question, asked the same way by the command and by the preview.
      const problem = placementProblemAt(data, state, room.defId, cmd.x, cmd.y, room.id);
      if (problem !== null) return reject(problem);

      // Nothing is charged and nothing is lost: the guests inside, the decor
      // and the staff all come along, because only the coordinates change.
      room.x = cmd.x;
      room.y = cmd.y;
      out.push({ type: 'roomMoved', roomId: room.id, x: cmd.x, y: cmd.y });
      return { ok: true, events: out };
    }

    case 'STORE_ROOM': {
      const room = state.hotel.rooms.find((r) => r.id === cmd.roomId);
      if (!room) return reject('unknownRoom');
      const def = roomDef(data, room.defId);
      if ('required' in def && def.required) return reject('roomRequired');
      if (room.occupants.length > 0) return reject('roomOccupied');
      // A haunting is a hazard too: storing the room and placing it back used
      // to return it with `hasGhost: false`, a free exorcism.
      if (room.hasFire || room.hasPest || room.hasGhost) return reject('roomHasHazard');
      // Storage is not a broom cupboard for problems. A filthy room drags the
      // hotel's average down; letting it be put away would make cleaning
      // optional and the rating a lie.
      if (room.cleanliness < data.economy.cleanliness.incomeGateThreshold) return reject('roomTooDirty');

      state.hotel.rooms = state.hotel.rooms.filter((r) => r.id !== room.id);
      state.storedRooms.push({
        id: room.id,
        defId: room.defId,
        decor: room.decor,
        decorPoints: room.decorPoints,
        cleanliness: room.cleanliness,
        builtAtTick: room.builtAtTick,
      });
      // The person who worked here keeps their job and their grade. They are
      // simply not standing anywhere until the player says so.
      for (const member of state.staff) {
        if (member.roomId === room.id) {
          member.roomId = null;
          out.push({ type: 'staffUnassigned', staffId: member.id });
        }
      }
      refreshStars(data, state, out);
      out.push({ type: 'roomStored', roomId: room.id });
      return { ok: true, events: out };
    }

    case 'PLACE_STORED_ROOM': {
      const index = state.storedRooms.findIndex((r) => r.id === cmd.roomId);
      if (index < 0) return reject('notStored');
      const stored = state.storedRooms[index]!;
      const def = roomById(data, stored.defId);
      if (!def) return reject('unknownRoom');
      if (state.hotel.rooms.length >= data.economy.limits.maxRoomsPerHotel) {
        return reject('roomLimitReached');
      }

      let px = cmd.x;
      let py = cmd.y;
      if (px === undefined || py === undefined) {
        const spot = findFreeSpot(data, state, def.blocks);
        if (!spot) return reject('noSpace');
        px = spot.x;
        py = spot.y;
      }
      const problem = placementProblemAt(data, state, stored.defId, px, py);
      if (problem !== null) return reject(problem);

      // Every check has passed, so the room leaves storage and lands in one
      // step. It is the same room that went in — same id, same decor, same
      // condition — not a new one built from the definition.
      state.storedRooms.splice(index, 1);
      state.hotel.rooms.push({
        id: stored.id,
        defId: stored.defId,
        x: px,
        y: py,
        decor: stored.decor,
        decorPoints: stored.decorPoints,
        cleanliness: stored.cleanliness,
        hasPest: false,
        hasGhost: false,
        hasFire: false,
        occupants: [],
        staffId: null,
        builtAtTick: stored.builtAtTick,
      });
      refreshStars(data, state, out);
      out.push({ type: 'roomRestored', roomId: stored.id, x: px, y: py });
      return { ok: true, events: out };
    }

    case 'ASSIGN_STAFF': {
      const member = state.staff.find((st) => st.id === cmd.staffId);
      if (!member) return reject('unknownStaff');
      const room = state.hotel.rooms.find((r) => r.id === cmd.roomId);
      if (!room) return reject('unknownRoom');
      const rdef = roomDef(data, room.defId);
      const wanted = 'staffRole' in rdef ? rdef.staffRole : null;
      if (!wanted || wanted !== member.roleId) return reject('roleMismatch');
      if (room.staffId && room.staffId !== member.id) return reject('slotFilled');
      if (member.roomId === room.id) return reject('slotFilled');

      // Leaving the old post is part of taking the new one; a member of staff
      // standing in two rooms would have their efficiency counted twice.
      for (const other of state.hotel.rooms) {
        if (other.staffId === member.id) other.staffId = null;
      }
      member.roomId = room.id;
      room.staffId = member.id;
      out.push({ type: 'staffAssigned', staffId: member.id, roomId: room.id });
      return { ok: true, events: out };
    }

    case 'UNASSIGN_STAFF': {
      const member = state.staff.find((st) => st.id === cmd.staffId);
      if (!member) return reject('unknownStaff');
      if (member.roomId === null) return reject('slotFilled');
      for (const room of state.hotel.rooms) {
        if (room.staffId === member.id) room.staffId = null;
      }
      member.roomId = null;
      out.push({ type: 'staffUnassigned', staffId: member.id });
      return { ok: true, events: out };
    }

    case 'FIRE_STAFF': {
      const member = state.staff.find((st) => st.id === cmd.staffId);
      if (!member) return reject('unknownStaff');
      for (const room of state.hotel.rooms) {
        if (room.staffId === member.id) room.staffId = null;
      }
      state.staff = state.staff.filter((st) => st.id !== member.id);
      out.push({ type: 'staffFired', staffId: member.id });
      return { ok: true, events: out };
    }

    case 'RENAME_HOTEL': {
      const name = cmd.name.trim();
      if (name.length === 0 || name.length > 24) return reject('invalidName');
      state.hotel.name = name;
      return { ok: true, events: out };
    }
  }

  /*
   * A command whose type matches no case fell out of this function as
   * `undefined`, and every caller does `result.ok` — so a malformed command
   * from the interface crashed rather than being refused. The switch is
   * exhaustive over `Command`, so this is unreachable by anything the type
   * system can see; it exists for what arrives at runtime from a stale client
   * or a replayed log.
   */
  return reject('unknownCommand');
}

function refreshStars(data: SimData, state: GameState, out: SimEvent[]): void {
  const next = computeStars(data, state);
  if (next !== state.hotel.stars) {
    out.push({ type: 'starsChanged', from: state.hotel.stars, to: next });
    state.hotel.stars = next;
  }
}

/** Convenience for tests and the balance sim: apply many commands in order. */
export function executeAll(data: SimData, state: GameState, cmds: Command[]): SimEvent[] {
  const events: SimEvent[] = [];
  for (const cmd of cmds) {
    const res = execute(data, state, cmd);
    if (res.ok) events.push(...res.events);
  }
  return events;
}

/** True when the room's guest tier makes it worth building at this level. */
export function isBuildable(data: SimData, state: GameState, defId: string): boolean {
  const def = roomById(data, defId);
  if (!def) return false;
  if (def.unlockLevel > state.player.level) return false;
  if (!canAfford(state, def.cost)) return false;
  return findFreeSpot(data, state, def.blocks) !== null;
}
