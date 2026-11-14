# The circuit store

[`src/core/circuit.ts`](../../src/core/circuit.ts) is the heart of GElement: one object that remembers every **wire**'s state and tells anyone listening when it changes. Every part (switches, displays, the overlay) will read and drive wires through it. It's plain TypeScript, with no React and no DOM, so it's easy to test and could sit under any UI layer.

This guide walks through it top to bottom.

## The shape of a wire

```ts
export interface WireState {
	readonly powered: boolean;
	readonly signal: string | null;
}
```

A wire carries **power** (on or off) and an optional **signal** (a value such as `'night'`, or `null` for none). `readonly` makes TypeScript reject `state.powered = true`: you change a wire only by asking the circuit to drive it.

```ts
const OFF: WireState = Object.freeze({ powered: false, signal: null });
```

Every wire nobody has driven yet reads as this one shared object. `Object.freeze` enforces `readonly` at runtime too, so no code can change `OFF` by accident and corrupt every unknown wire at once.

Docs: [Object.freeze](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze)

## The interface

```ts
export interface Circuit {
	read(wire: string): WireState;
	drive(wire: string, next: Partial<WireState>): void;
	subscribe(wire: string, listener: Listener): () => void;
}
```

Three operations, and nothing else: **read** a wire, **drive** it, or **subscribe** to its changes. `Partial<WireState>` means `drive` takes either field, or both: `{ powered: true }` leaves the signal alone.

## Private state through a closure

```ts
export function createCircuit(): Circuit {
	const wires = new Map<string, WireState>();
	const listeners = new Map<string, Set<Listener>>();

	return {
		read: …,
		drive: …,
		subscribe: …,
	};
}
```

`wires` and `listeners` are local variables of `createCircuit`. The three methods are created inside it, so they can still reach those variables after `createCircuit` returns, but nothing else can. That's a **closure**: the returned object is the only way in, which is what makes the store the single source of truth. Each call to `createCircuit()` makes a fresh, independent circuit (the tests rely on that).

- **`Map<string, WireState>`** stores each wire's current state by name. Unlike a plain object, a `Map` has no inherited keys to collide with (a wire named `constructor` is fine).
- **`Map<string, Set<Listener>>`** stores, per wire, the functions to call when it changes. A `Set` ignores duplicates, and deletes in one call.

Docs: [Closures](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures), [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map), [Set](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set)

## `read`

```ts
read: (wire) => wires.get(wire) ?? OFF,
```

`??` (nullish coalescing) falls back to `OFF` when the wire has never been driven.

## `drive`

```ts
drive(wire, next) {
	const prev = wires.get(wire) ?? OFF;
	const state: WireState = {
		powered: next.powered ?? prev.powered,
		signal: next.signal === undefined ? prev.signal : next.signal,
	};
	if (state.powered === prev.powered && state.signal === prev.signal) return;
	wires.set(wire, Object.freeze(state));
	listeners.get(wire)?.forEach((listener) => listener());
},
```

1. **Merge.** Each field keeps its previous value unless `next` provides one. Notice that the two fields use different tests:
   - `powered` uses `??`, which falls back on `null` or `undefined`. A boolean is never `null`, so this means "unless provided".
   - `signal` uses `=== undefined`, because `null` is a _real_ signal value meaning "no signal". With `??`, `drive('theme', { signal: null })` would silently keep the old signal, and you could never clear one.
2. **Skip no-ops.** If nothing changed, return early: no new object, no notifications. Driving a powered wire to `powered: true` again is free, and listeners never wake up for nothing.
3. **Store a new frozen object.** Each change replaces the wire's state with a _new_ object instead of editing the old one. So "did this wire change?" is answerable by identity alone (`old !== new`), which is exactly what React relies on (below).
4. **Notify** this wire's listeners. `?.` skips the call when nobody has subscribed.

## `subscribe`

```ts
subscribe(wire, listener) {
	let set = listeners.get(wire);
	if (!set) listeners.set(wire, (set = new Set()));
	set.add(listener);
	return () => set.delete(listener);
},
```

It creates the wire's listener set the first time it's needed, then adds the listener. The return value is an **unsubscribe** function: calling it removes exactly this listener. Returning the cleanup from the subscribe call means callers can't lose track of it, and a React effect can return it directly.

## How React will use it

React has a hook made for stores that live outside React: `useSyncExternalStore(subscribe, getSnapshot)`. It needs a `subscribe(callback)` that returns an unsubscribe function, and a `getSnapshot()` that returns the _same_ object until something changes. The circuit was shaped for that: `subscribe` returns its cleanup, and `read` returns the stored frozen object, the same reference until `drive` replaces it.

A hook in the coming `react/` layer could look roughly like this (a sketch, not code in the repo yet):

```ts
function useWire(circuit: Circuit, wire: string): WireState {
	return useSyncExternalStore(
		(onChange) => circuit.subscribe(wire, onChange),
		() => circuit.read(wire),
	);
}
```

Docs: [useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)

## The tests

[`circuit.test.ts`](../../src/core/circuit.test.ts) pins down each rule above:

- **Unknown wires** read as unpowered, with no signal.
- **Power and signal** are driven independently: setting one keeps the other.
- **Notifications** happen only on real changes (driving `powered: true` twice calls the listener once), and stop after unsubscribing. A `vi.fn()` spy counts the calls.

When you add a behavior to the store, add the test that states it in plain words first.
