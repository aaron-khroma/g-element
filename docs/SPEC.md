# GElement Specification (draft 1)

> GElement is a clean-room successor to **QElement**, an earlier proprietary web-component library by the same author. It keeps QElement's best _ideas_ (declarative linking, a power state, breakpoint-scoped triggers) and none of its code.

## 1. What QElement got right, and what changes

| QElement idea                                                        | Keep?        | GElement form                                                                                                                                                                 |
| -------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Behavior is declared in markup, never by reaching into instances     | ✅           | Props/attributes only. One imperative escape hatch: `circuit.power(net, state)`.                                                                                              |
| A boolean **power** state drives everything                          | ✅           | Power stays the core concept.                                                                                                                                                 |
| `on` / `power-down` attributes give CSS transition hooks             | ✅, renamed  | A four-phase **edge** state: `off → rising → on → falling → off`.                                                                                                             |
| `powered` attribute sets the starting state                          | ✅           | `powered`                                                                                                                                                                     |
| `control` slot                                                       | renamed      | **`input`** / **`inputs`**: the elements a user operates                                                                                                                      |
| `content` slot                                                       | renamed      | **`output`**: the elements a part drives                                                                                                                                      |
| `key`                                                                | renamed      | **`signal`**: a value carried alongside power (a mode name, URL, index…)                                                                                                      |
| `target="id"` matched `[q-tag="id"]`                                 | ✅, reframed | **Wires**: a named connection, `wire="mode"`. Every part and element on the same wire is connected.                                                                           |
| `group` (mutual exclusion) + `q-default`                             | ✅, reframed | **`bus`**: only one member conducts at a time. **`pullup`** marks the member that powers on when nothing else drives the bus (a pull-up resistor's job).                      |
| `sustain` (stay on while hovered)                                    | ✅           | **`hold`**                                                                                                                                                                    |
| Breakpoint-scoped configs and triggers (`max-lg:click`)              | ✅           | Same syntax, with the Tailwind breakpoints from `@theme`                                                                                                                      |
| DOM attributes _are_ the state                                       | ❌           | In React, React owns the DOM, so attributes changed from outside get clobbered. State lives in a **circuit store**, and DOM attributes are only a _projection_ of it for CSS. |
| Async init counting attributes and slots                             | ❌           | Unnecessary: React and the store know when a part is mounted.                                                                                                                 |
| `tabindex` juggling (`notab`, `tabhide`)                             | ❌           | The native `inert` attribute (Baseline Widely Available)                                                                                                                      |
| `noscroll` refcount, `dismiss`, `focusin`, `loadin`, `store` configs | ✅           | Carried over as generic configs                                                                                                                                               |

## 2. Architecture

GElement is a **standalone React library** in its own public GitHub repo (`aaron-khroma/gelement`), published to npm. It knows nothing about Gridiv or the land. Projects that need more extend it:

- **`GridivElement`** lives inside Gridiv, and exists only if Gridiv turns out to need gridmap-aware behavior.
- **`MElement`** lives in the Style Eyes site repo, because its 3D block matrix is bespoke (see §5, an example of extending GElement).

```
gelement (npm package)
├── core/      Circuit store: wires, buses, parts, power & signal state, edges.
│              Plain TypeScript, no DOM, no React. Fully unit-testable.
├── react/     <GCircuit>, <GSwitch/>, <GTriode/>… plus hooks: usePower(wire), useSignal(wire), useEdge(wire)
└── overlay/   Functional overlay (dev tool, tree-shaken from production builds)
```

**Real vs virtual parts.** Real (DOM-rendering) and virtual (logic-only) parts are distinguished by a prop, which also carries over if a custom-element tier is ever added (§2a):

- Every React part renders **nothing** by default. It registers itself in the circuit and does its logic in the background, adding no DOM node.
- `<GSwitch as="button">…</GSwitch>`, or `asChild` to adopt the child element, makes a real part that renders an element with the right ARIA (Accessible Rich Internet Applications) attributes and `data-g-*` attributes.

## 2a. How the "tiers" would work, and why v1 is React-only

There are two ways to put interactive behavior on a web page. QElement used the second.

**React components (the React tier).** A React component is a function that returns markup. React builds and updates the DOM for you, and the component's state lives in JavaScript, not in the DOM. You use it inside JSX:

```tsx
<GSwitch wire="menu" as="button">
	Menu
</GSwitch>
```

This only works inside a React app, because React has to render it.

**Custom elements (a web-component tier).** A custom element is a class registered with the browser via `customElements.define('g-switch', GSwitchElement)`. Afterwards, the browser itself upgrades every `<g-switch>` tag it finds, whether it came from React, PHP, Liquid, or a static HTML file. QElement worked this way, which is why it could run inside server-rendered templates with no framework. The cost is that the element's state lives in DOM attributes, which React also wants to control. That's why GElement keeps state in its store instead.

**How both could share one brain.** The `core/` circuit store is plain TypeScript, so either tier can sit on top of it:

```
            core (circuit store)
           ┌──────────┴──────────┐
     react/ (hooks)       elements/ (custom elements)
   <GSwitch wire="x">     <g-switch wire="x">
```

A `<g-switch>` on a PHP page and a `<GSwitch>` in React would drive the same kind of wire in the same kind of store. Each tier is a thin adapter that translates its world (React renders, or DOM attributes and events) into store calls.

**v1 builds only the React tier.** The first consumers (Gridiv and the Style Eyes site) render everything with React, including gridmap content. Keeping `core/` free of React costs almost nothing and keeps the door open: `elements/` gets added when a non-React page needs GElement.

## 3. Vocabulary

| Term        | Meaning                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Circuit** | The store. There's one per app, provided by `<GCircuit>`, which also mounts the overlay.                                                                  |
| **Wire**    | A named connection, `wire="mode-panel"`. Carries **power** (boolean) and an optional **signal** (value).                                                  |
| **Bus**     | A named set of parts where only one conducts at a time (radio behavior).                                                                                  |
| **Part**    | A component that reads and/or drives wires: switch, triode, relay…                                                                                        |
| **Input**   | The element a user operates to trigger a part: a button, a block face, a key.                                                                             |
| **Output**  | The element(s) a part powers: a panel, a label, a block.                                                                                                  |
| **Trigger** | The event(s) that fire an input: `trigger="click"`, `"mouseleave\|mouseenter"`, `"max-md:click md:mouseenter"`.                                           |
| **Edge**    | Transition phase: `rising` / `falling`. CSS hooks wait for `transitionend`, as `power-down` did.                                                          |
| **Load**    | Any plain element connected to a wire without being a part. It receives `data-g-power`, `data-g-edge`, `data-g-signal`, and `inert` when the config asks. |

**CSS projection.** Tailwind custom variants `g-on:`, `g-off:`, `g-rising:`, `g-falling:`, and `g-signal-[value]:` read the projected data attributes. Example: `class="opacity-0 g-on:opacity-100 g-falling:opacity-0 transition"`.

## 4. Starter parts (examples, not a full set)

| Part              | Circuit analogy                  | Behavior                                                                                                                           | Replaces                   |
| ----------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `GSwitch`         | Toggle switch                    | Its input toggles power on its wire. ARIA: `aria-pressed`, or `role="switch"` / `aria-expanded` by config.                         | `q-flip`                   |
| `GSet` / `GReset` | Set / reset lines of a flip-flop | One-way: only powers on, or only powers off                                                                                        | `q-flip-on` / `q-flip-off` |
| `GTriode`         | Triode / gate                    | Passes power from its `input` wire to its `output` wire only while its grid wire is powered                                        | `q-triode`                 |
| `GRelay`          | Relay                            | Mirrors one wire onto another, optionally inverted (`invert`)                                                                      | `q-mirror`                 |
| `GRotary`         | Rotary switch                    | Cycles a wire's **signal** through `positions={['day','night','auto']}`. Inputs `prev` / `next`. ARIA radio group with arrow keys. | `q-replace` / `q-swap`     |
| `GDisplay`        | Display                          | Renders the output matching the wire's current signal, with enter/exit edges                                                       | `q-message`                |
| `GHold`           | Sample-and-hold                  | Keeps a wire powered while any `hold` element is hovered or focused, with a release delay                                          | `sustain`                  |

### Example: the home tagline (React, virtual parts)

```tsx
<GCircuit>
	{/* Each verb block drives the "tagline" wire's signal while hovered or focused */}
	<Block
		id="program"
		gSignal={{
			wire: 'tagline',
			value: 'websites',
			trigger: 'mouseleave|mouseenter focusout|focusin',
		}}
	/>
	…
	<h2>
		Let us be your <br /> eyes for{' '}
		<GDisplay wire="tagline" fallback="style" transition="rise-fade" />
	</h2>
</GCircuit>
```

### Example: the functional overlay

`<GCircuit overlay>` can draw a toggleable SVG layer over the page:

- **Wires** are lines between the bounding boxes of every input, part, and load on a wire. Powered wires glow, and the current signal value is printed on the wire.
- **Virtual parts** float as small chip icons near their first connected element.
- **Coloring** uses the **spinel** debug role from the brand palette.
- **Toggling:** the overlay is toggled with a hidden key chord (and later by a spinel debug block). It's tree-shaken out of production builds unless explicitly enabled.

## 5. MElement (the land)

`MElement` extends GElement for the faux-3D matrix:

- **Position is matrix coordinates**, not DOM layout: `cell={[x,y,z]}` and `span={[sx,sy,sz]}`. These become CSS custom properties that the face transforms consume.
- **Overrides:**
  - _power_ can be bound to a **coordinate offset**. For example, `poweredOffset={[0,-1,0]}` means "rise one unit when on".
  - _edges_ follow the matrix's transition timing.
  - _inputs_ are block faces.
- **Adds `parent` / `child` linking.** A child's `cell` is relative to its parent's _current_ position, so children follow every movement of the parent. Collision validation runs on resolved positions, and blocks may leave the 4×4×4 bounds only through a powered offset.
- **The MODE block** is an `MElement` switch with `poweredOffset={[0,-1,0]}`. Its child, the selector (relative cell `[0,0,1]`), is an `MElement` rotary over the `theme` wire. Its arrow faces are the rotary's `prev` / `next` inputs, and its top face is a `GDisplay` of the signal.

## 6. Design decisions

1. **Packaging:** GElement is a standalone React library on npm (`gelement`). Gridiv extends it with `GridivElement` only if needed. `MElement` lives in the landpage repo.
2. **Custom-element tier:** not in v1. `core/` stays React-free so the tier can be added later (§2a).
3. **Wire scope:** wires are global. Wires declared inside a gridmap are namespaced by the gridmap's name (`gridmap-name/wire`), so two gridmaps on one page can't collide. Un-namespaced wires (`theme`, `tagline`) belong to the host app, and a gridmap may connect to them deliberately.
