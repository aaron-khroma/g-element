# GElement Implementation Plan (v0.1)

> Companion to [SPEC.md](SPEC.md). The spec says _what_ GElement is; this says _how_ v0.1 gets built. It covers Phase 2 of the Style Eyes plan (`styleeyes-landpage/the-plan.md`, Nov 23 – Dec 4): the circuit store, the React layer, the starter parts `GSwitch`, `GRotary`, `GDisplay`, and `GHold`, the `dismiss` / `focusin` / `noscroll` / `inert` configs, the Tailwind variants, overlay v0, and Storybook.
>
> **Clean-room rule:** QElement (`starforge-quasar`) was studied for _behavior_ only. Nothing here is derived from its code.

## 1. Decisions

Settled with Aaron on 2026-11-12. Items marked **(spec)** change SPEC.md, which has been updated to match.

| #   | Decision                                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **Wire model: latch + drivers.** A wire is on while its _latch_ is set or any _driver_ is active. Latching writes (toggles, set/reset, rotary, `circuit.power`) are last-write-wins. Momentary drivers (hover triggers, `GHold`, relays, triode outputs) are ORed in. **(spec)** |
| G2  | **Headless hooks first.** Each part is a hook (`useGSwitch` …) returning props to spread. Components (`<GSwitch as / asChild>`) are thin sugar over them. A virtual part is a hook used in your own component, or a logic-only component that renders `null`.                    |
| G3  | **Loads are hook/ref spreads** (`useLoad(wire)`, `<GLoad asChild>`). React renders the `data-g-*` attributes, so the prerendered HTML is correct. There is no DOM scanning. **(spec: README example)**                                                                           |
| G4  | **Configs are typed props**, each `true` or a breakpoint scope: `<GSwitch dismiss focusin noscroll="max-md">`. `trigger` stays a string mini-language.                                                                                                                           |
| G5  | **Edges are per-wire and synchronized.** A wire stays `rising`/`falling` until every connected load finishes its transition, with a timer fallback. **(spec)**                                                                                                                   |
| G6  | **Starting state is circuit-only.** `powered` and the initial `signal` are declared on `<GCircuit wires>` (or `<GScope wires>`), never on parts. **(spec)**                                                                                                                      |
| G7  | **Buses are circuit-level** too: `<GCircuit buses={{ nav: { wires: [...], pullup: 'program' } }}>`. **(spec)**                                                                                                                                                                   |
| G8  | **Breakpoints use Tailwind semantics.** Stacked prefixes AND together (`md:max-lg:click`). Space-separated entries are independent and additive, and an unscoped entry always applies. **(spec)**                                                                                |
| G9  | **Namespaces are path-style.** Inside `<GScope name="case-study">`, `wire="gallery"` is `case-study/gallery`, and `wire="/theme"` is the app's `theme`. Unprefixed names are always local. **(spec)**                                                                            |

**Proposed defaults (my calls; override any of these in review):**

| #   | Proposal                                                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Trigger arity picks latch or driver.** A single event (`click`) does the part's latching action. A pair (`mouseleave\|mouseenter`) drives momentarily: the on-event asserts a driver, and the off-event releases it. This one rule covers toggles, hover menus, and the tagline.                                                                                                      |
| P2  | **`circuit.power(wire, false)` is a hard off.** It clears the latch _and_ cuts active drivers until they're re-asserted. That's what `dismiss` and bus exclusion need: Escape closes a hover menu even while the pointer is still over it.                                                                                                                                              |
| P3  | **Signals are `string \| null`.** They project to `data-g-signal` and `g-signal-[…]:`, and stay JSON-safe for gridmap content. An index is written as `"2"`.                                                                                                                                                                                                                            |
| P4  | **Part hooks are prefixed `useG*`** (`useGSwitch`, `useGSignal`, `useGRotary`, `useGHold`) so they never collide with the reader hooks `usePower`, `useSignal`, and `useEdge`.                                                                                                                                                                                                          |
| P5  | **The library ships no animation presets.** `GDisplay` drops the spec example's `transition="rise-fade"`, and the tagline's rise-and-fade is styled in the landpage with `g-rising:` / `g-falling:` classes. This keeps QElement's "unopinionated" rule.                                                                                                                                |
| P6  | **The overlay is a separate entry** (`@styleeyes/g-element/overlay` → `<GOverlay />`), which the app includes behind its own dev flag. That's the only reliable way to keep it out of production bundles, and it replaces `<GCircuit overlay>`. Its color is a CSS variable, `--g-overlay-color`, which the landpage sets to spinel, because the library knows nothing about the brand. |
| P7  | **Interrupted edges reverse immediately** (`rising → falling`). There is no lockout like `q-dialog`'s. CSS transitions reverse naturally from wherever they are. MElement can add a lockout if the matrix needs one.                                                                                                                                                                    |
| P8  | **Hooks outside `<GCircuit>` throw.** There's no implicit global store, because prerendering needs a fresh circuit per render.                                                                                                                                                                                                                                                          |

## 2. The wire, precisely

Every wire holds:

```ts
type Signal = string | null;
type Edge = 'off' | 'rising' | 'on' | 'falling';

interface WireState {
	readonly powered: boolean; // latch || any active, uncut driver
	readonly signal: Signal; // newest active driver's signal, else the latched signal
	readonly edge: Edge;
	readonly everPowered: boolean; // replaces QElement's `loadin`: render media once this is true
}
```

**Resolution rules** (all in `core/`, all unit-tested):

1. **Power** = `latch || drivers.some(active && !cut)`.
2. **Signal** = the signal of the most recently asserted active driver that carries one, else the latched signal. The tagline works this way: hovering a verb drives `websites`, and leaving releases it, so the signal falls back to `null` and `GDisplay` shows its fallback.
3. **Release delay.** `release(wire, driver, { delay })` keeps the driver active for `delay` ms. Re-asserting within that window cancels the release. This is `GHold`'s and hover intent's mechanism.
4. **Sustain-only drivers** (`GHold`) count only if the wire was already on when they asserted. A hold can keep a wire on, but never turn it on. That's QElement's `sustain` contract.
5. **Hard off** (P2). `power(wire, false)` clears the latch and marks every active driver `cut`. A cut driver stops counting until it's released and asserted again.
6. **Buses.** When any member's power rises, every other member gets a hard off. When the last member's power falls and the bus has a `pullup`, the pullup's latch is set. At creation, the pullup starts on unless another member is declared `powered`. Two members declared `powered` is a dev error.
7. **Edges.** A power change sets `rising` or `falling` and starts a new edge _generation_. Participants (loads with transitions) call `const done = circuit.holdEdge(wire)` during commit. The edge settles to `on`/`off` when every hold of the current generation is done. Core waits one frame before settling an edge with no holds, so loads get a chance to register. A reversal starts a new generation, and stale `done` calls are ignored.

`data-g-power` follows power **immediately**, and `data-g-edge` follows the phase. So `g-on:` matches during `rising` and `on`, and `g-falling:` is what keeps a closing element visible while it animates out (`hidden g-on:block g-falling:block`), as `power-down` did.

## 3. `core/` (no React, no DOM)

```
src/core/
├── circuit.ts       createCircuit(): latch, drivers, signal, buses, subscriptions
├── edge.ts          edge generations and holds
├── names.ts         resolveWire(name, scopePath): '/theme' → 'theme', 'gallery' + 'case-study' → 'case-study/gallery'
├── trigger.ts       parseTrigger('max-md:click md:mouseleave|mouseenter') → TriggerEntry[]
├── scope.ts         parseScope('md:max-lg') → media query '(width >= 48rem) and (width < 64rem)'
├── registry.ts      connections: which parts, inputs, and loads sit on each wire (for the overlay and aria-controls)
└── index.ts
```

**API sketch** (replaces the scaffold's `drive(wire, partial)`; the existing test is rewritten):

```ts
interface CircuitDeclarations {
	wires?: Record<string, { powered?: boolean; signal?: string }>;
	buses?: Record<string, { wires: string[]; pullup?: string }>;
}

interface Circuit {
	// Reading
	read(wire: string): WireState; // frozen and identity-stable until it changes (useSyncExternalStore-safe)
	subscribe(wire: string, listener: () => void): () => void;
	subscribeAll(listener: (wire: string) => void): () => void; // overlay

	// Latching writes (the spec's escape hatch is `power`)
	power(wire: string, on: boolean): void; // false = hard off (P2)
	toggle(wire: string): void;
	setSignal(wire: string, signal: Signal): void;

	// Momentary drivers
	drive(wire: string, driver: symbol, opts?: { signal?: string; sustainOnly?: boolean }): void;
	release(wire: string, driver: symbol, opts?: { delay?: number }): void;

	// Edges
	holdEdge(wire: string): () => void;

	// Declarations (GCircuit at creation, GScope at render; idempotent)
	declare(decls: CircuitDeclarations, scope?: string): () => void;

	// Registry
	connect(wire: string, c: { kind: 'part' | 'input' | 'load'; label: string; element?: unknown }): () => void;
	connections(wire: string): readonly Connection[];
}

createCircuit(decls?: CircuitDeclarations, env?: { setTimeout; clearTimeout; frame }): Circuit;
```

`env` makes timers injectable, so core tests run deterministically and core never touches `window`.

**Trigger grammar** (G8, P1):

```
trigger := entry (' ' entry)*
entry   := scope* action
scope   := ('max-')? breakpoint ':'
action  := event                  // latching: the part's primary action
         | event '|' event        // momentary: off-event | on-event
```

**Keeping core pure:** ESLint `no-restricted-imports` (react) and `no-restricted-globals` (`window`, `document`, …) for `src/core/**`, plus a `tsconfig.core.json` with `lib: ["ES2023"]` (no DOM) run in `typecheck`.

## 4. `react/`

```
src/react/
├── GCircuit.tsx      creates the circuit once (useState) from props: wires, buses, breakpoints
├── GScope.tsx        name + wires + buses; declares during render (SSR) and in an effect (StrictMode re-mount)
├── context.ts        circuit + current scope path
├── hooks.ts          useCircuit, useWire, usePower, useSignal, useEdge (useSyncExternalStore + getServerSnapshot)
├── load.ts           useLoad, <GLoad>: projection + edge participation
├── settle.ts         transition tracking for edges (see below)
├── media.ts          breakpoint store: scope → MediaQueryList, read at event time, subscribable
├── listeners.ts      attaches native listeners for trigger strings via the ref callback
├── slot.tsx          minimal asChild Slot (merge props + refs; React 19 `props.ref`)
├── configs/          dismiss.ts, focusin.ts, noscroll.ts
└── parts/            switch.tsx, signal.tsx, rotary.tsx, hold.tsx, display.tsx (+ set/reset, relay, triode later)
```

**Listeners are native, attached in the ref callback** (React 19 ref cleanup), not React `on*` props. Any DOM event name works (`focusin`, `pointerenter`, custom events), and breakpoint scopes are checked with `MediaQueryList.matches` when the event fires. Nothing is re-bound on resize. Disabled inputs are skipped.

**Projection.** `useLoad(wire, opts)` returns:

```ts
{ ref, 'data-g-power': 'on' | 'off', 'data-g-edge': Edge, 'data-g-signal'?: string, inert?: boolean }
```

`opts.inert` is `true` (inert while off or falling) or a scope (`'max-md'`). An unscoped `inert` is in the prerendered HTML. A **scoped** one can't be known at prerender, so it's applied after hydration. Hiding should come from CSS, so this only affects the moment before hydration.

**Edge settling (`settle.ts`).** On edge start, each load's layout effect reads `getComputedStyle` (`transition-duration` + `transition-delay`, and `animation-*`). If the longest is 0, it doesn't hold the edge. Otherwise it takes a hold and releases it on the first of:

- `transitionend`/`animationend` with `event.target === event.currentTarget` (descendants' transitions bubble; this was a lesson from `q-dialog`) for the longest-running property, or
- a fallback timer at the computed duration + 50 ms.

Reduced motion needs no special case: `motion-reduce:transition-none` gives 0 ms, so edges settle on the next frame.

**Prerender and hydration rules:**

- `GCircuit` creates the circuit from declarations during render, so the static HTML reflects `powered`, `signal`, and pullups (G6, G7).
- `GScope` declares during render, so its subtree prerenders correctly. Reading a scoped wire from _outside and above_ its scope can't be prerender-correct, and a dev warning covers it.
- Anything browser-dependent (breakpoint scopes, `aria-controls` ids, the overlay) appears after hydration.

## 5. Parts

All hooks take resolved-at-render wire names (scope applied) and register their input element in the registry via the returned `ref`.

| Part (hook → component)                | Returns / renders                                                            | Latching action                    | Momentary (`off\|on`)                                 | ARIA                                                                                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useGSwitch` → `GSwitch`               | `{ inputProps, state }`                                                      | toggle                             | drive power                                           | `aria-pressed` (default). `aria="expanded"` (implied by `dismiss`) → `aria-expanded` + `aria-controls`. `aria="switch"` → `role="switch"` + `aria-checked`. |
| `useGSignal` → `GSignal`               | `{ inputProps }`                                                             | `setSignal(value)`                 | drive signal (the tagline's verbs)                    | none (it's the consumer's link/button)                                                                                                                      |
| `useGRotary` → `GRotary`               | `{ groupProps, optionProps(pos), prevProps, nextProps, signal }`             | prev/next step through `positions` | (n/a)                                                 | `radiogroup` + `radio`/`aria-checked`, roving tabindex, arrow keys (wraps by default). Prev/next are plain buttons with labels.                             |
| `useGHold` → `GHold`                   | `{ holdProps }`                                                              | (n/a)                              | sustain-only driver, `release` delay (default 300 ms) | none                                                                                                                                                        |
| `GDisplay` (+ `useGDisplay`)           | renders an output per signal (default `as="span"`)                           | (n/a: a reader)                    | (n/a)                                                 | `aria-hidden` or `live="polite"` by prop                                                                                                                    |
| `GSet` / `GReset`, `GRelay`, `GTriode` | later (cheap on G1: relay and triode are derived drivers that render `null`) |                                    |                                                       |                                                                                                                                                             |

**Components:** `as="button"` renders that element with `inputProps`. `asChild` merges them into the single child. A non-button `as` gets `role="button"`, `tabIndex={0}`, and Enter/Space activation. Without `as`/`asChild`, a component renders nothing. That's meaningful for logic-only parts (`GRelay`, `GTriode`). For input parts it's a dev warning until document-level "key" inputs exist (§9).

**`GDisplay` detail.** Each output is keyed by signal. On a signal change, the old output stays mounted with `data-g-edge="falling"`, and the new one mounts in a pre-frame state, then gets `data-g-edge="rising"` on the next frame. Both reuse `settle.ts`, but they're scoped to the _output_, not the wire (a signal change isn't a power edge). Outputs share one grid cell, so they can cross-fade in place. `children` is `(signal) => ReactNode`, and it defaults to the signal text. `fallback` covers `null`.

## 6. Configs: QElement → GElement

| QElement                                            | GElement v0.1                                                                                                                                                                                                                                                                                                                                                                                                                                       | When    |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `dismiss`                                           | `GSwitch` prop. Escape in the input or any load on the wire → hard off, refocus the input. Focus leaving input + loads (checked in the next frame) → hard off without refocus. Guards carried over as _behavior_: ignore while a pointer is down on the input (Safari/Firefox don't focus clicked buttons), treat focus returning to the input as inside, and do nothing if the wire is already off (so nested panels don't close their ancestors). | Phase 2 |
| `focusin`                                           | `GSwitch` prop. On power-on, after commit (so `inert` is gone), focus the first tabbable descendant of the first load in DOM order, skipping `tabindex="-1"`, with `preventScroll`.                                                                                                                                                                                                                                                                 | Phase 2 |
| `noscroll`                                          | `GSwitch` prop (`true` or a scope). A claim is tied to the **wire's power**, not the part instance, so any power-off path releases it (the `q-dialog` leak can't happen). One root-level effect locks `documentElement` overflow while any claimed wire is on and its scope matches, and re-evaluates on breakpoint changes.                                                                                                                        | Phase 2 |
| `notab`, `tabhide`                                  | `useLoad(wire, { inert })`                                                                                                                                                                                                                                                                                                                                                                                                                          | Phase 2 |
| `loadin`                                            | `everPowered` in wire state: the consumer renders media once it's true                                                                                                                                                                                                                                                                                                                                                                              | Phase 2 |
| `store`                                             | wire declaration `{ store: 'local' \| 'session' }`, restored after hydration (one re-render; documented flash). Unused by the landpage (D7).                                                                                                                                                                                                                                                                                                        | Later   |
| `cascade`                                           | wire declaration `{ parent: 'menu' }`: a parent's hard off hard-offs its children                                                                                                                                                                                                                                                                                                                                                                   | Later   |
| `scrollto`                                          | `GSwitch` prop, `scrollIntoView({ block: 'nearest' })` on the first load                                                                                                                                                                                                                                                                                                                                                                            | Later   |
| `fliptext`, `checkbox`, `switch`, `anim`            | Replaced by rendering from `usePower` and by `aria="switch"`; SVG animation is CSS's job                                                                                                                                                                                                                                                                                                                                                            | Dropped |
| `link`, `sync`, `nomodal`, `onlyadd`, `closedialog` | App or Shopify specific. Use a real `<a>`, or app code with `useCircuit()`.                                                                                                                                                                                                                                                                                                                                                                         | Dropped |

## 7. Breakpoints and Tailwind

- **Values:** read `--breakpoint-*` from `:root` on mount if they're emitted (Tailwind 4 only emits unused theme variables under `@theme static`). Otherwise use Tailwind's defaults (`sm` 40rem … `2xl` 96rem), and `<GCircuit breakpoints>` overrides both. Queries use range syntax: `md` → `(width >= 48rem)`, `max-md` → `(width < 48rem)`.
- **Variants:** `@plugin "@styleeyes/g-element/tailwind";` registers `g-on`, `g-off`, `g-rising`, `g-falling` (`addVariant`) and `g-signal-[…]` (`matchVariant`), all matching **the element itself**. Tailwind 4 composes them with its own `group-*`, `peer-*`, `in-*`, and `not-*`, so `in-g-on:rotate-180` styles a chevron inside a powered button. The plugin is written in TypeScript and emitted by `tsc`, so D28's no-bundler rule holds. `tailwindcss` is an optional peer dependency.

## 8. Overlay v0 (`@styleeyes/g-element/overlay`)

`<GOverlay chord="Alt+Shift+G" />`, a dev tool (P6):

- It uses a portal into `document.body`: one fixed, `pointer-events: none` SVG over the viewport, hidden until the chord toggles it.
- It reads `circuit.connections()` and `subscribeAll()`. For each wire, it draws a polyline linking the centers of its connected elements' bounding boxes in DOM order. Powered wires glow, and the signal is printed at the midpoint.
- Virtual parts (no element) are drawn as chips next to their first connected element.
- It re-measures on scroll, resize, and wire changes (rAF-batched), and only while visible.
- `--g-overlay-color` sets the color (the landpage maps it to spinel).

## 9. Package, tooling, tests

- **Exports:** `.` (core + react), `./core`, `./overlay`, `./tailwind`. Peers: `react ^19` (optional for `./core`), `react-dom` (overlay portal), and `tailwindcss` (optional, for the plugin).
- **Dev dependencies to add:** `react-dom`, `@testing-library/react`, `@testing-library/user-event`, `tailwindcss` (to test the plugin), and Storybook 10 (Vite builder; dev-only, so the library build stays `tsc`).
- **Tests:**
  - `core/`: pure unit tests with an injected `env` (fake clock and frame). They cover every resolution rule in §2, including bus/pullup, hard off, sustain-only, release delays, edge generations, and name resolution.
  - `react/` in jsdom: hooks, projection, listeners, configs, and the settle fallback path (jsdom has no transitions, so `getComputedStyle` is stubbed).
  - **Prerender tests:** `renderToString` of real trees, asserting that `data-g-*`, `inert`, and pullups are in the HTML.
  - **Storybook:** every part gets a story, plus the a11y addon and interaction tests in a real browser (focus, transitions, reduced motion). The tagline demo is the Phase 2 exit story.
- **CI:** the existing job, plus Storybook interaction tests once they exist.

## 10. Build order

Each step is one PR into `prime`, with a changeset where behavior changes.

1. **`core`: the wire.** Latch, drivers, signal resolution, hard off, release delays, sustain-only, declarations, buses and pullup, `env` injection, and the core purity lint. Rewrites the scaffold test.
2. **`core`: edges, names, triggers, scopes, and the registry.**
3. **`react`: foundation.** `GCircuit`, `GScope`, reader hooks, `useLoad`/`GLoad`, `settle.ts`, `media.ts`, `listeners.ts`, `Slot`, and prerender tests.
4. **Parts:** `GSwitch`, `GSignal`, `GHold`, `GRotary`, `GDisplay`.
5. **Configs:** `dismiss`, `focusin`, `noscroll`, scoped `inert`.
6. **The Tailwind plugin.**
7. **Overlay v0.**
8. **Storybook,** with stories for every part and the tagline and menu demos, then the `0.1.0` release.

**Exit (from the landpage plan):** `@styleeyes/g-element@0.1.0` is published, and the tagline demo (verb hover → `GDisplay`) works in Storybook with keyboard and reduced-motion support.

**Landpage follow-ups this unlocks:** the `theme` wire (`<GCircuit wires={{ theme: { signal: 'auto' } }}>`, plus an app effect that maps the signal onto `<html data-theme>` and keeps the inline head script for the first paint), the header's mobile menu (`GSwitch dismiss focusin noscroll="max-md"`), and MElement (Phase 3), built on `useGSwitch`/`useGRotary` with faces as inputs and its own edge settling.

## 11. Open items (not blocking v0.1)

| #   | Item                                                                                                                                                                  | Needed by    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Q1  | **Typed wire names:** a `Register` interface (the TanStack Router pattern), so `wire="mnu"` is a type error in apps that opt in                                       | Nice-to-have |
| Q2  | **Document-level inputs** ("a key" in the spec's Input definition): e.g. `trigger="window:keydown"` with a key filter, which would give a bare `<GSwitch>` a real use | When needed  |
| Q3  | **MElement hooks into edges:** confirm in Phase 3 that "matrix transition timing" works as `holdEdge` participants, not a core change                                 | Phase 3      |
| Q4  | **Gridmap declarations:** how Gridiv's JSON declares a gridmap's `wires`/`buses` for its `GScope` (schema lives in Gridiv)                                            | Phase 5      |
