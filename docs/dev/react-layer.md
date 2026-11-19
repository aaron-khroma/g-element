# The React layer

`src/react/` connects React components to the circuit store. The store already does the hard work (power, signals, buses, edges), so this layer has three jobs: give components a circuit to talk to, re-render them when the wires they read change, and connect elements to wires so CSS can style them and their transitions can hold edges.

This guide assumes the [circuit store](circuit-store.md) guide. Terms: a **board** is what `<GCircuit>` provides (the circuit, plus breakpoint queries and device bookkeeping); a **receiver** is an element connected to a wire.

## `<GCircuit>`: one circuit per tree

[`GCircuit.tsx`](../../src/react/GCircuit.tsx) creates the board in a [`useState`](https://react.dev/reference/react/useState) initializer and provides it through [context](https://react.dev/learn/passing-data-deeply-with-context):

- **Created during the first render**, not in an effect. Effects don't run when prerendering, so a circuit created in one would leave the static HTML in the wrong state. The initializer runs once, and the same board comes back on every later render.
- **Starting states only.** Later changes to `wires` and `buses` are ignored, like a form input's `defaultValue`. A new `key` starts over.
- **No global fallback.** Hooks outside a `<GCircuit>` throw ([`context.ts`](../../src/react/context.ts)). A module-level circuit would be shared by every request a server prerenders, leaking one visitor's state into another's page.

## Reader hooks: `usePower`, `useSignal`, `useEdge`, `useWire`

[`hooks.ts`](../../src/react/hooks.ts) builds all four on [`useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore), React's hook for reading state that lives outside React. It takes three functions:

| Argument            | Here                            | React's contract                                                        |
| ------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| `subscribe`         | `circuit.probe(wire, onChange)` | Call `onChange` when the value may have changed; return an unsubscribe. |
| `getSnapshot`       | `read(circuit.measure(wire))`   | Return the same value (by `Object.is`) until it really changes.         |
| `getServerSnapshot` | the same function               | The value while prerendering and during hydration.                      |

Each hook reads one value (a boolean or a string), so a component that only shows power doesn't re-render when the signal changes. `subscribe` is wrapped in [`useCallback`](https://react.dev/reference/react/useCallback): a new function on every render would make React unsubscribe and resubscribe each time.

Hooks take **wire names**, and `useWirePath` turns each into the **wire path** the circuit uses, bundled into the nearest `<GDevice>`.

## `<GDevice>`: bundled wires with their own schematic

A **device** is parts and receivers working together on wires of their own. [`GDevice.tsx`](../../src/react/GDevice.tsx) resolves its name against its parent device's, provides that device path to everything inside, and installs its schematic with every wire, bus, and bus member bundled into it (`gallery` becomes `case-study/gallery`).

Installing has to happen **during render**, so the device's subtree prerenders with its starting states. Render-time side effects are normally off-limits because React may render a component more than once before it mounts (StrictMode does it on purpose in development). The device keeps them safe by keying its install on [`useId`](https://react.dev/reference/react/useId), which is the same across those extra renders, in a map on the board: a render installs only if that id hasn't installed yet. An effect uninstalls on unmount, and installs again on StrictMode's development-only remount.

## Receivers: `useReceiver` and `<GReceiver>`

[`receiver.tsx`](../../src/react/receiver.tsx) returns props to spread on an element: `data-g-power`, `data-g-edge`, `data-g-signal`, `inert` when asked, and a `ref`.

- **The ref** is a [ref callback](https://react.dev/reference/react-dom/components/common#ref-callback) that connects the element to the wire in the registry and returns a cleanup that disconnects it (React 19 runs a ref callback's returned function when the element detaches).
- **Edge holds.** A [`useLayoutEffect`](https://react.dev/reference/react/useLayoutEffect) runs when the edge becomes `rising` or `falling`. By then the new `data-g-edge` attribute is in the DOM, so the computed style shows the transition that attribute triggers, and the circuit's settling frame hasn't run yet. [`settle.ts`](../../src/react/settle.ts) reads the longest transition or animation from [`getComputedStyle`](https://developer.mozilla.org/docs/Web/API/Window/getComputedStyle) and holds the edge until its own `transitionend`/`animationend` (ignoring events that bubble up from descendants), or a timer at its computed length plus 50 ms. Nothing moving means no hold, so `motion-reduce:transition-none` needs no special case.
- **`<GReceiver>`** renders a `div`, or with `asChild`, passes the props to its child through [`Slot`](../../src/react/slot.tsx).

## `Slot`: `asChild`

`Slot` clones its single child with merged props: the child's own props win, except that event handlers both run, class names join, styles merge, and both refs get the element. The merged ref is memoized, because a new ref callback on every render makes React detach and reattach it, which would disconnect and reconnect the receiver each time.

## Triggers and breakpoints: `listeners.ts`, `media.ts`

Parts (next PR) respond to trigger strings like `max-md:click md:mouseleave|mouseenter`.

- [`attachTrigger`](../../src/react/listeners.ts) adds native listeners with [`addEventListener`](https://developer.mozilla.org/docs/Web/API/EventTarget/addEventListener), so any DOM event name works. Each entry's breakpoint scope is checked when its event fires, so nothing re-binds on resize. Disabled inputs are skipped.
- `useTrigger` wraps it in a ref callback that stays the same while the trigger string does. Listeners call the latest handlers through a ref, so a part passing new handler functions every render doesn't re-attach anything.
- [`media.ts`](../../src/react/media.ts) answers scopes with [`matchMedia`](https://developer.mozilla.org/docs/Web/API/Window/matchMedia), one `MediaQueryList` per query. Breakpoints are Tailwind's defaults, then the page's `--breakpoint-*` variables, then `<GCircuit breakpoints>`.

## Prerendering and hydration

[Prerendering](https://react.dev/reference/react-dom/server/renderToString) runs components on the server (or at build time) to produce HTML; [hydration](https://react.dev/reference/react-dom/client/hydrateRoot) attaches React to that HTML in the browser. Hydration expects the browser's first render to produce exactly the same HTML. If it doesn't, React throws the HTML away and renders from scratch, which flashes and costs time.

The rules this layer follows:

- **Everything the HTML shows comes from the circuit**, which is built during render from the same props on both sides. So the first client render matches.
- **Browser-only facts wait for hydration.** Breakpoints, computed styles, and elements are only touched in effects, ref callbacks, and event handlers, which never run while prerendering.

[`prerender.test.tsx`](../../src/react/prerender.test.tsx) renders real trees in Node, with no DOM at all, and checks the HTML. [`hydrate.test.tsx`](../../src/react/hydrate.test.tsx) hydrates that HTML and checks that React kept it unchanged and reported no mismatch. It watches for both ways React 19 reports one: a text mismatch is an error React recovers from by rendering from scratch, but an attribute mismatch (a wrong `data-g-power`, say) is only logged to the console, and the attribute stays wrong.
