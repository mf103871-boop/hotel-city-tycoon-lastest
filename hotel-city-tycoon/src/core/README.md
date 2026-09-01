# src/core — the pure simulation

This directory is **deliberately empty in P1**. It fills up in P2.

Nothing in here may import a renderer, a UI framework, a storage adapter, or
touch `window`, `document`, `Date.now()` or `Math.random()`. Those rules are
enforced by `eslint.config.js` and are not advisory — violating them fails the
build.

The reason is not purity for its own sake. It is that the same code has to run
in four places: the game, a unit test, the headless balance simulator, and
eventually an authoritative server. Only a module with no ambient dependencies
can do that.

Time and randomness enter as arguments. State goes in, state comes out.
