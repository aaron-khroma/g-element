# Publishing to npm

How a change in this repo becomes a new version of `@styleeyes/g-element` on npm: what the package contains, how versions are chosen, and what the release workflow does.

## The short version

1. In your PR, run `npm run changeset`, pick the bump type, and write one line for the changelog. Commit the file it creates.
2. Merge the PR. The release workflow opens (or updates) a **release PR** titled `chore: release`.
3. Merge the release PR when you want to ship. The workflow publishes the new version to npm.

The rest of this guide explains each piece.

## What gets published

`npm run build` compiles `src/` into `dist/` with `tsc -p tsconfig.build.json`: JavaScript, `.d.ts` type declarations, and source maps. `package.json` then decides what's in the package and what can be imported:

- **`files`** lists what goes into the tarball: `dist`, plus `src` without tests (so declaration maps can point editors at real source).
- **`exports`** lists the entry points apps may import. Each has a `types` path (first, so TypeScript picks it) and a `default` JavaScript path. Paths not listed here are private.
- **`"type": "module"`** makes the package ES modules only.

Docs: [package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json), [Package entry points](https://nodejs.org/api/packages.html)

### ESM output and the `.js` extension

Node loads ES modules by exact path: `import './core'` fails, because there's no file named `core`, only `core/index.js`. Bundlers like Vite are forgiving and guess the extension; Node is not.

GElement's very first publish had exactly this bug: its `dist/index.js` said `export * from './core'`, which worked in Vite's dev server but crashed a Node build that imported the package. The fix had two parts:

- **`"module": "NodeNext"`** in `tsconfig.json` makes TypeScript require relative imports to name the file the way Node will: `from './core/index.js'`, even though the source file is `.ts`. TypeScript maps `.js` back to `.ts` while checking, and leaves the import text untouched in the output.
- **The `smoke` script** (`node -e "import('./dist/index.js')"`, the last step of `npm run check`) loads the built package with plain Node, so this kind of break fails before it ships.

Docs: [ES modules in Node](https://nodejs.org/api/esm.html), [TypeScript modules reference](https://www.typescriptlang.org/docs/handbook/modules/reference.html)

## Choosing a version: Changesets

Versions follow **semantic versioning**: `major.minor.patch`. Below 1.0 the rules shift down one place: while the API is still settling, a **minor** bump (0.1 → 0.2) may break things, and a **patch** bump (0.1.0 → 0.1.1) is for fixes and small additions. That's why consumers depend on ranges like `0.x` or `^0.1.0` (which allows 0.1.x only).

Docs: [Semantic Versioning](https://semver.org/)

[Changesets](https://changesets.dev/guide/getting-started) records the intent to release _with the change itself_, instead of someone deciding at release time:

```sh
npm run changeset
```

It asks for a bump type (patch, minor, major) and a summary, then writes a small Markdown file to `.changeset/`:

```md
---
'@styleeyes/g-element': patch
---

Notify subscribers only when a wire's state actually changes.
```

Commit it with the PR. Changes that don't affect the published package (docs, CI, tests) don't need one. Several changesets can pile up between releases; the largest bump wins, and every summary lands in the changelog.

## The release workflow

[`.github/workflows/release.yml`](../../.github/workflows/release.yml) runs on every push to `prime`, using the [Changesets action](https://github.com/changesets/action). It does one of two things:

- **There are changesets in `.changeset/`:** it runs `changeset version` on a branch and opens (or updates) a PR titled `chore: release`, Changesets' "Version Packages" PR. That PR applies the pending changesets: it bumps `version` in `package.json`, writes the summaries into `CHANGELOG.md`, and deletes the changeset files. Nothing is published yet; the PR just shows what the next release will be, and keeps updating as more changes merge.
- **There are none** (which is the case right after the release PR merges): it runs `npm run release`, which builds and runs `changeset publish`. That publishes any version not yet on npm, tags it in git, and creates a GitHub release.

Docs: [Versioning and publishing](https://changesets.dev/guide/versioning-and-publishing), [Automating Changesets](https://changesets.dev/guide/automating)

### Why the release PR needs an admin merge

`prime` only accepts PRs whose CI passed. But the release PR is opened by the workflow using its built-in `GITHUB_TOKEN`, and GitHub deliberately doesn't start new workflow runs from events that token causes (it prevents workflows from triggering each other in a loop). So CI never runs on the release PR, and it can only be merged by an admin bypassing the rule.

That's safe here because the release PR contains only version numbers and changelog text, and every change in it already passed CI on its own PR. If that ever becomes a problem, the usual fix is to have the action open the PR with a different token (a GitHub App or a personal access token), whose events do trigger CI.

Docs: [GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token)

## Trusted Publishing: no npm token

The workflow never stores an npm password or token. Instead, npm is configured (in the package's settings on npmjs.com, under **Trusted Publisher**) to accept publishes from exactly one place: this GitHub repo's `release.yml` workflow. At publish time, GitHub hands the workflow a short-lived identity token (that's what `permissions: id-token: write` allows), and npm checks it against that setting. There's no long-lived secret that could leak.

`"publishConfig": { "provenance": true }` adds a signed **provenance** statement to each release: a public record of which commit and workflow built it. npm shows it on the package page, so anyone can verify the package came from this repo's source.

Docs: [Trusted publishers](https://docs.npmjs.com/trusted-publishers), [Provenance](https://docs.npmjs.com/generating-provenance-statements)

## Checklist for a release

- [ ] Each PR that changes published behavior has a changeset.
- [ ] `npm run check` passes locally (including `smoke`).
- [ ] The `chore: release` PR shows the version and changelog you expect.
- [ ] Merge it (admin bypass), then confirm the new version on npmjs.com, with its provenance badge.
