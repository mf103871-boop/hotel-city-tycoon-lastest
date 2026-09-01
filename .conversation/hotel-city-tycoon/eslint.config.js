import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Layer boundaries are the load-bearing rule of this codebase.
 *
 * src/core must stay a pure, deterministic, serialisable simulation:
 * no renderer, no framework, no browser globals, no ambient clock.
 * That purity is what lets the same code run in a test, in a headless
 * balance simulation, and one day on an authoritative server.
 *
 * These are errors, not warnings. A build that violates them fails.
 */
const FORBIDDEN_IN_CORE = [
  { group: ['pixi.js', 'pixi.js/*', '@pixi/*'], message: 'src/core must not import a renderer. Move rendering to src/render.' },
  { group: ['react', 'react-dom', 'react/*', 'react-dom/*'], message: 'src/core must not import React. Move UI concerns to src/ui.' },
  { group: ['zustand', 'zustand/*'], message: 'src/core owns state directly. The store lives in src/bridge.' },
  { group: ['framer-motion', 'howler', 'i18next', 'idb'], message: 'src/core must stay dependency-free. Use the matching adapter layer.' },
  { group: ['@render/*', '@ui/*', '@bridge/*', '@save/*', '@audio/*', '@i18n/*'], message: 'src/core may not depend on an outer layer. Dependencies point inward only.' },
  { group: ['../render/*', '../ui/*', '../bridge/*', '../save/*', '../audio/*', '../i18n/*'], message: 'src/core may not depend on an outer layer. Dependencies point inward only.' },
];

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'public/assets'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },

  // ---- the pure core -------------------------------------------------
  {
    files: ['src/core/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': ['error', { patterns: FORBIDDEN_IN_CORE }],
      'no-restricted-globals': ['error',
        { name: 'window', message: 'src/core must not touch the DOM.' },
        { name: 'document', message: 'src/core must not touch the DOM.' },
        { name: 'localStorage', message: 'Persistence belongs to src/save.' },
        { name: 'navigator', message: 'src/core must not read the environment.' },
      ],
      'no-restricted-properties': ['error',
        { object: 'Date', property: 'now', message: 'Time must be injected into the simulation, never read ambiently. Determinism depends on it.' },
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in src/core/rng. Determinism depends on it.' },
      ],
      'no-restricted-syntax': ['error',
        { selector: 'NewExpression[callee.name="Date"]', message: 'Time must be injected into the simulation, never constructed ambiently.' },
      ],
    },
  },

  // ---- the renderer owns no game rules --------------------------------
  {
    files: ['src/render/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['react', 'react-dom'], message: 'The canvas layer must never re-render through React.' },
          { group: ['@ui/*', '../ui/*'], message: 'src/render may not depend on src/ui.' },
        ],
      }],
    },
  },

  // ---- the UI never reaches past the bridge ---------------------------
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@core/*', '../core/*', '../../core/*'], message: 'React must go through src/bridge, never straight into the simulation.' },
          { group: ['pixi.js', '@pixi/*'], message: 'The HUD does not talk to the renderer directly.' },
        ],
      }],
    },
  },

  // ---- tooling and tests may do as they please ------------------------
  // Declared explicitly rather than pulling in the `globals` package: this is
  // the entire set these scripts actually touch.
  {
    files: ['tools/**/*.{ts,mjs,js}', 'tests/**/*.ts', '*.config.{ts,js,mjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        performance: 'readonly',
        __dirname: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-restricted-properties': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  /*
   * `browser-diagnostic.js` is pasted into the browser console on the running
   * game. It sits in tools/ for want of anywhere better, so the Node block
   * above claims it and every DOM global it touches reads as undefined — 15
   * errors for a file that is correct. The environment was mislabelled, not
   * the code.
   */
  {
    files: ['tools/browser-diagnostic.js'],
    languageOptions: {
      globals: {
        location: 'readonly',
        navigator: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        indexedDB: 'readonly',
        innerWidth: 'readonly',
        innerHeight: 'readonly',
        devicePixelRatio: 'readonly',
        performance: 'readonly',
        console: 'readonly',
      },
    },
  },

  // ---- the service worker runs in its own global scope -----------------
  {
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
        console: 'readonly',
      },
    },
  },

  // ---- browser globals for app code -----------------------------------
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/core/**'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        performance: 'readonly',
        indexedDB: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        globalThis: 'readonly',
        IDBDatabase: 'readonly',
        IDBObjectStore: 'readonly',
        IDBRequest: 'readonly',
        IDBTransactionMode: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLDivElement: 'readonly',
        WheelEvent: 'readonly',
      },
    },
  },
);
