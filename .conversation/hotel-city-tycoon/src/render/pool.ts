/**
 * Object pooling.
 *
 * Guests and effects are created and destroyed constantly. Allocating a new
 * sprite for each one produces garbage-collection pauses that read as stutter,
 * so objects are recycled instead. Nothing in the render loop should ever
 * call `new`.
 */
export interface PoolOptions<T> {
  create: () => T;
  /** Called when an object is handed out. */
  activate?: (item: T) => void;
  /** Called when an object is returned; should clear per-use state. */
  reset?: (item: T) => void;
  /** Objects to build up front, so the first frames do not allocate. */
  prewarm?: number;
  /** Hard ceiling. Beyond this, `acquire` returns null rather than growing. */
  max?: number;
}

export class Pool<T> {
  private readonly free: T[] = [];
  private readonly opts: PoolOptions<T>;
  private liveCount = 0;

  constructor(opts: PoolOptions<T>) {
    this.opts = opts;
    for (let i = 0; i < (opts.prewarm ?? 0); i++) this.free.push(opts.create());
  }

  acquire(): T | null {
    const existing = this.free.pop();
    if (existing !== undefined) {
      this.liveCount++;
      this.opts.activate?.(existing);
      return existing;
    }
    if (this.opts.max !== undefined && this.liveCount >= this.opts.max) return null;
    const created = this.opts.create();
    this.liveCount++;
    this.opts.activate?.(created);
    return created;
  }

  release(item: T): void {
    this.opts.reset?.(item);
    this.free.push(item);
    this.liveCount = Math.max(0, this.liveCount - 1);
  }

  get live(): number { return this.liveCount; }
  get pooled(): number { return this.free.length; }
  get total(): number { return this.liveCount + this.free.length; }
}

/**
 * Keeps one view per game entity, recycling views as entities come and go.
 * This is the pattern the guest and staff layers use: the simulation owns a
 * list of ids, and this keeps the sprites in sync without churn.
 */
export class KeyedPool<T> {
  private readonly pool: Pool<T>;
  private readonly active = new Map<string, T>();

  constructor(opts: PoolOptions<T>) {
    this.pool = new Pool(opts);
  }

  /** Reconcile the live set with `keys`. Returns what changed. */
  sync(keys: readonly string[]): { added: Array<[string, T]>; removed: string[] } {
    const wanted = new Set(keys);
    const added: Array<[string, T]> = [];
    const removed: string[] = [];

    for (const [key, item] of this.active) {
      if (!wanted.has(key)) {
        this.pool.release(item);
        this.active.delete(key);
        removed.push(key);
      }
    }
    for (const key of keys) {
      if (this.active.has(key)) continue;
      const item = this.pool.acquire();
      if (item === null) break;
      this.active.set(key, item);
      added.push([key, item]);
    }
    return { added, removed };
  }

  get(key: string): T | undefined { return this.active.get(key); }
  entries(): IterableIterator<[string, T]> { return this.active.entries(); }
  get size(): number { return this.active.size; }
  get pooled(): number { return this.pool.pooled; }

  clear(): void {
    for (const [, item] of this.active) this.pool.release(item);
    this.active.clear();
  }
}
