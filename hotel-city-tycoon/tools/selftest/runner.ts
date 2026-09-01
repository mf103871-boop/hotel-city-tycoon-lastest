/**
 * The runner, tested.
 *
 * Every other selftest trusts `check()` to report the truth. It did not: it
 * called the callback and counted a tick the instant the call returned, so an
 * async test was marked green before it had run and its assertions settled
 * later in a rejected promise nobody was listening to. Tests that could not
 * fail were being counted as passing, and the count was quoted as evidence.
 *
 * So the runner needs a test of its own, and it cannot use itself to run it.
 * Everything below is plain asserts against a private copy of the same
 * implementation the suites use.
 *
 * Run: node --experimental-strip-types tools/selftest/runner.ts
 */

/*
 * This file is a module, on purpose.
 *
 * Every other selftest imports something, which makes it a module and lets it
 * use `await` at the top level. This one imports nothing — it tests the runner
 * against a private copy rather than reaching into the project — so without a
 * top-level export TypeScript reads it as a script, where top-level `await` is
 * not allowed. That is seven TS1375 errors in `npm run verify`, from a file
 * that runs perfectly under Node.
 *
 * An empty export is the whole fix. Importing something from `src/` to get the
 * same effect would drag production code into a test of the test harness.
 */
export {};

let passed = 0;
const failures: string[] = [];
function ok(condition: unknown, message: string): void {
  if (condition) { passed++; console.log(`  ✓ ${message}`); }
  else { failures.push(message); console.log(`  ✗ ${message}`); }
}

/**
 * The runner under test.
 *
 * A copy rather than an import, because the suites define theirs at module
 * scope with their own counters. Copying keeps this file honest about what it
 * is checking: the shape of the fix, which a reviewer can compare against any
 * of the three files by eye.
 */
type TestFn = () => void | Promise<void>;

function makeRunner() {
  const tests: Array<{ name: string; fn: TestFn }> = [];
  const log: string[] = [];
  let count = 0;
  const failed: string[] = [];

  const check = (name: string, fn: TestFn): void => { tests.push({ name, fn }); };

  const runAll = async (): Promise<void> => {
    for (const test of tests) {
      try {
        await test.fn();
        count++;
        log.push(`pass:${test.name}`);
      } catch {
        failed.push(test.name);
        log.push(`fail:${test.name}`);
      }
    }
  };

  return { check, runAll, log, failed, registered: tests, passed: () => count };
}

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — the test runner itself');
console.log(line);

// ------------------------------------------------- registration is not running

{
  const r = makeRunner();
  let ran = false;
  r.check('a', () => { ran = true; });
  ok(!ran, 'registering a test does not run it');
  ok(r.registered.length === 1, 'the test was queued');
  await r.runAll();
  ok(ran, 'the queued test ran when the loop reached it');
}

// ------------------------------------------------- a resolved promise is awaited

{
  const r = makeRunner();
  let finished = false;
  r.check('slow', async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    finished = true;
  });
  await r.runAll();
  ok(finished, 'the runner waited for a resolved promise to finish');
  ok(r.passed() === 1, 'a resolved async test counted as one pass');
}

// ------------------------------------------------- a rejected promise is a failure

{
  const r = makeRunner();
  r.check('throws later', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    throw new Error('this must be caught');
  });
  await r.runAll();
  ok(r.failed.length === 1, 'a rejected promise was recorded as a failure');
  ok(r.passed() === 0, 'a rejected promise was not also counted as a pass');
}

// ------------------------------------------------- the old bug, reproduced

{
  /*
   * The runner as it was. Kept here on purpose: this is the exact shape that
   * counted six tests green without running them, and having it beside the
   * fix is what stops it quietly coming back.
   */
  let brokenPassed = 0;
  const brokenFailures: string[] = [];
  const brokenCheck = (name: string, fn: () => void): void => {
    try { (fn as TestFn)(); brokenPassed++; }
    catch { brokenFailures.push(name); }
  };
  /*
   * The rejection is caught here only so it does not kill this process.
   *
   * That is itself the point: under the old runner nothing caught it, so in a
   * suite the rejection went unhandled — Node would print it and abort the
   * run, or in an older Node simply swallow it. Either way the test had
   * already been counted as a pass.
   */
  const escaped: Error[] = [];
  brokenCheck('always fails, eventually', (() => {
    const promise = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new Error('never seen');
    })();
    promise.catch((e: Error) => escaped.push(e));
    return promise;
  }) as unknown as () => void);
  await new Promise((resolve) => setTimeout(resolve, 40));
  ok(escaped.length === 1, 'the old runner let the failure escape the try/catch entirely');
  ok(brokenPassed === 1 && brokenFailures.length === 0,
    'the old runner did count a failing async test as a pass — the bug is real');
}

// ------------------------------------------------- order and completeness

{
  const r = makeRunner();
  r.check('one', async () => { await new Promise((res) => setTimeout(res, 20)); });
  r.check('two', () => {});
  r.check('three', async () => { throw new Error('no'); });
  await r.runAll();
  ok(r.log.join(',') === 'pass:one,pass:two,fail:three',
    'tests ran in order, each finishing before the next began');
  ok(r.passed() === 2 && r.failed.length === 1, 'the tally matches what happened');
}

// ------------------------------------------------- nothing is printed early

{
  const r = makeRunner();
  let logAtStart = -1;
  r.check('records when it starts', async () => {
    logAtStart = r.log.length;
    await new Promise((resolve) => setTimeout(resolve, 15));
  });
  await r.runAll();
  ok(logAtStart === 0, 'nothing was reported before the test began');
  ok(r.log.length === 1, 'exactly one line was reported after it finished');
}

// ------------------------------------------------- the suites use this shape

{
  const fs = await import('node:fs');
  for (const name of ['timeline', 'amenities', 'feedback', 'invariants']) {
    const src = fs.readFileSync(`tools/selftest/${name}.ts`, 'utf8');
    const queues = src.includes('tests.push({ name, fn })') || src.includes('queue.push({ name, fn })');
    const awaits = src.includes('await test.fn()') || src.includes('await t.fn()');
    const noHardExit = !src.includes('process.exit(');
    ok(queues && awaits && noHardExit,
      `${name}.ts registers, awaits, and does not call process.exit()`);
  }
}

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exitCode = failures.length ? 1 : 0;
