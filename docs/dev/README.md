# Developer guide

How GElement is built, for learning and for reference. The **map** below walks the repo from the top down. Each system lists the features and concepts it uses, where to see them in the code, and the official docs to read next. **Guides** go deeper on one system at a time.

What GElement _is_ and how its API is designed lives in [SPEC.md](../SPEC.md); setup and workflow live in the [README](../../README.md) and [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Guides

| Guide                                 | Covers                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------- |
| [The circuit store](circuit-store.md) | `createCircuit()` line by line: private state, wires, and subscriptions    |
| [Publishing to npm](publishing.md)    | ESM output, the `exports` map, Changesets, release PRs, Trusted Publishing |

Add a guide when a system gets big enough to need a walkthrough, and link it from the map below.

## Map of the repo

```
g-element/
├── src/                      The library's TypeScript source
│   ├── index.ts              Root entry point: re-exports everything public
│   └── core/                 The circuit store: plain TypeScript, no React, no DOM
│       ├── index.ts          The `@styleeyes/g-element/core` entry point
│       ├── circuit.ts        createCircuit(): wires, power, signal, subscribers
│       └── circuit.test.ts   Its unit tests
├── dist/                     Build output (git-ignored): .js, .d.ts, and source maps
├── docs/                     SPEC.md (the design) and this guide
├── .changeset/               Changesets config, plus pending release notes
├── .github/                  CI and release workflows, and the PR template
└── tsconfig*.json, *.config.*  TypeScript, Vitest, ESLint, Prettier
```

`src/react/` (parts and hooks) and `src/overlay/` (the dev tool) arrive with v0.1; see [SPEC.md §2](../SPEC.md#2-architecture).

### The public API: `package.json` and `src/index.ts`

What other projects can import is decided in `package.json`, not by which files exist.

- **The `exports` map** lists every entry point: `.` (the package root, from `src/index.ts`) and `./core`. Anything not listed can't be imported, which keeps internal files private. Inside each entry, `types` comes first so TypeScript finds the `.d.ts` before the JavaScript.
  Docs: [Package entry points](https://nodejs.org/api/packages.html)
- **`"type": "module"`** makes every `.js` file an ES module (`import`/`export`), not CommonJS (`require`).
- **`"sideEffects": false`** promises bundlers that importing a file does nothing on its own, so they can drop ("tree-shake") any part an app doesn't use.
  Docs: [Tree shaking](https://webpack.js.org/guides/tree-shaking/)
- **`files`** decides what goes into the npm package: `dist`, plus `src` (minus tests), so the published declaration maps can take an editor's "go to definition" straight to the TypeScript source.
- **`peerDependencies`** names React as a dependency the _host app_ provides, so an app never ends up with two Reacts. It's marked optional because `core/` doesn't need React at all.
  Docs: [package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json)

### TypeScript: `tsconfig.json`, `tsconfig.build.json`

- **Two configs.** `tsconfig.json` typechecks everything, tests and config files included (`npm run typecheck`). `tsconfig.build.json` extends it to emit `dist/`: JavaScript, `.d.ts` type declarations, and maps, leaving the tests out.
- **`NodeNext` modules.** Imports between source files end in `.js` (`from './circuit.js'`), even though the file on disk is `circuit.ts`. TypeScript resolves `.js` to the `.ts` file and leaves the import text as it is, and Node needs that extension at runtime. The [publishing guide](publishing.md#esm-output-and-the-js-extension) tells the story of when this went wrong.
  Docs: [Modules reference](https://www.typescriptlang.org/docs/handbook/modules/reference.html)
- **Stricter than `strict`**, all in the [tsconfig reference](https://www.typescriptlang.org/tsconfig/):
  - `noUncheckedIndexedAccess`: `array[i]` and `record[key]` may be `undefined`, so you must check.
  - `exactOptionalPropertyTypes`: an optional property may be left out, but not set to `undefined` explicitly.
  - `verbatimModuleSyntax`: type-only imports and exports must say so (`export type { Circuit }` in [`core/index.ts`](../../src/core/index.ts)), so the compiler can delete them without guessing.

### The circuit store: `src/core/`

The single source of truth for every wire's power and signal. It's framework-free, so the React layer (and maybe someday a custom-element layer) is a thin adapter over it ([SPEC.md §2a](../SPEC.md#2a-how-the-tiers-would-work-and-why-v1-is-react-only)). Concepts: closures for private state, `Map` and `Set`, immutable snapshots, and the subscribe/unsubscribe pattern React's `useSyncExternalStore` expects.
Guide: [The circuit store](circuit-store.md)

### Tests: `*.test.ts`, `vitest.config.ts`

- **Vitest** runs the tests in `src/**/*.test.ts`, next to the code they test.
- **`globals: true`** makes `describe`, `it`, `expect`, and `vi` available without importing them; `"types": ["vitest/globals"]` in `tsconfig.json` tells TypeScript about them.
- **`environment: 'jsdom'`** gives tests a simulated browser DOM, ready for the React parts.
- **`vi.fn()`** makes a spy: a stand-in function that records its calls, so a test can assert `toHaveBeenCalledTimes(1)`. See the subscription test in [`circuit.test.ts`](../../src/core/circuit.test.ts).

Docs: [Vitest guide](https://vitest.dev/guide/), [config](https://vitest.dev/config/), [`vi`](https://vitest.dev/api/vi.html)

### Quality checks: `npm run check`

`check` runs, in order: typecheck, lint (ESLint, then Prettier's formatting check), tests, build, and **smoke**. Smoke imports the built `dist/index.js` with plain Node, which catches a package that compiles but can't actually load.

- **ESLint** uses `typescript-eslint`'s strict rules and React's rules of hooks, in a flat config (`eslint.config.js`). Docs: [Configuration files](https://eslint.org/docs/latest/use/configure/configuration-files)
- **Prettier** owns formatting (tabs, single quotes, 100 columns). Docs: [Prettier](https://prettier.io/docs/)

### CI and releases: `.github/workflows/`, `.changeset/`

- **`ci.yml`** runs typecheck, lint, tests, and build on every pull request and every push to `prime`. `prime` requires it to pass.
- **`release.yml`** and **Changesets** turn merged changes into npm releases.
  Guide: [Publishing to npm](publishing.md)
