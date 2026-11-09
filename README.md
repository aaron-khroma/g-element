# GElement

**Declarative, circuit-themed interactivity for React.** Instead of threading state through props and callbacks, you connect components with named **wires** that carry **power** (on/off) and an optional **signal** (a value). Switches drive wires, displays and panels respond to them, and a functional overlay can draw the wiring right on top of your page.

> ⚠️ **Pre-release (0.x).** The API is being designed in the open. See [docs/SPEC.md](docs/SPEC.md).

```tsx
<GCircuit>
	<GSwitch wire="menu" as="button">
		Menu
	</GSwitch>
	<nav data-g-wire="menu" className="hidden g-on:block">
		…
	</nav>
</GCircuit>
```

## Status

| Layer                                             | State          |
| ------------------------------------------------- | -------------- |
| `gelement/core`: the framework-free circuit store | 🚧 started     |
| React parts and hooks                             | Planned (v0.1) |
| Functional overlay (dev tool)                     | Planned        |

## Install

```sh
npm install gelement
```

## Development

```sh
nvm use          # Node 26
npm install
npm run check    # typecheck, lint, test, build
```

**Releases** use [Changesets](https://github.com/changesets/changesets). Add a changeset with `npm run changeset` in any PR that changes published behavior. Merging to `prime` opens a release PR, and merging that publishes to npm.

**Developing against a consuming app:** apps can point their dev server at this repo's `src/` ("link mode") for hot reloading across repos. See the consuming app's docs.

## License

[MIT](LICENSE) © Aaron Clement
