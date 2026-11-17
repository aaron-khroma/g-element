# The circuit store

[`src/core/circuit.ts`](../../src/core/circuit.ts) is the heart of GElement: one object that holds every **wire**'s state and tells anything **probing** a wire when it changes. Every part (switches, displays, the overlay) reads and drives wires through it. It's plain TypeScript, with no React and no DOM, so it's easy to test and could sit under any UI layer. The rules it implements are specified in [PLAN.md §2](../PLAN.md#2-the-wire-precisely).

This guide walks through it from the outside in.

## Vocabulary

The code is named after the circuit it models. Most of these names come straight from digital electronics, where a wire with several drivers, a pullup, and a shared bus are everyday ideas.

| Term            | In the code                                      | Meaning                                                                                         |
| --------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **Measurement** | `measure(wire)` → `Measurement`                  | A wire's current power, signal, and `everPowered`, as one frozen object                         |
| **Latch**       | `power`, `toggle`, `setSignal`                   | A switch that stays where you put it                                                            |
| **Driver**      | `drive`, `release`                               | A momentary hand holding a wire on (a hover, a focus), identified by a `symbol`                 |
| **Trip**        | `trip(wire)`, `power(wire, false)`               | Like a breaker: clears the latch and cuts every driver until it's released and driven again     |
| **Bus**         | `buses` in a schematic                           | Wires where only one conducts at a time; a **pullup** member powers on when all are off         |
| **Schematic**   | `install(schematic)`, `createCircuit(schematic)` | Starting states and buses, installed into the circuit                                           |
| **Probe**       | `probe(wire, fn)`, `probeAll(fn)`                | A function that runs when a wire changes. Returns a function that detaches it                   |
| **Edge**        | `measure(wire).edge`, `holdEdge(wire)`           | Where a wire is in its transition: `rising` or `falling`, then settled `on` or `off`            |
| **Connection**  | `connect(wire, …)`, `connections(wire)`          | A part, input, or load registered on a wire, for the overlay and for inputs to find their loads |

## Using it

```ts
const circuit = createCircuit({
	wires: { theme: { signal: 'auto' } },
	buses: { nav: { wires: ['program', 'design'], pullup: 'program' } },
});

const detach = circuit.probe('menu', () => console.log(circuit.measure('menu')));

const hover = Symbol('hover');
circuit.drive('menu', hover); // menu is on while the pointer is over it
circuit.release('menu', hover, { delay: 300 }); // …and for 300 ms after it leaves
circuit.trip('menu'); // Escape: off now, even if something still holds it

circuit.power('design', true); // the nav bus trips `program`
detach();
```

## A wire: inputs and a reading

Inside the store, each wire is a `Wire` record with three **inputs** and one **reading**:

```ts
interface Wire {
	latch: boolean;
	latchedSignal: Signal;
	readonly drivers: Map<symbol, Driver>; // in assertion order, so the last is the newest
	reading: Measurement;
	edge: Edge; // and generation, holds, frame: see Edges below
}
```

`resolve(wire)` turns the inputs into a `Measurement`:

```
powered = latch OR (any driver that is engaged and not cut)
signal  = the newest such driver's signal, else the latched signal
edge    = the wire's current edge (see Edges)
```

So **a wire can be on while its latch is off.** A hovered menu has `latch: false` and one driver. Code that asks "is this wire on?" uses `measure(name).powered`, never `latch`.

`resolve` returns the **same** object when nothing changed (`sameReading` compares the values). Each real change produces a new, frozen object. That's what lets readers detect change by identity alone (below).

Docs: [Object.freeze](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze), [Equality comparisons](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Equality_comparisons_and_sameness)

### Why drivers are keyed by `Symbol`

A [`Symbol`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol) is a value guaranteed to be unique: `Symbol('hover') !== Symbol('hover')`, and the text is only a debugging label. Each thing that holds a wire creates its own symbol once and passes it to every `drive` and `release`. Two buttons hovering the same menu get two symbols, so one letting go never cancels the other. With strings, both could pick `'hover'`.

The symbol is the **key**. The `Driver` object is the **value** stored under it. The same symbol can be driven, released, and driven again, and the second `drive` stores a **new** `Driver` object. Code that must act on one particular assertion (a delayed release) compares `Driver` objects, not symbols.

### `Map` and `Set`, not objects

Wires, drivers, and probes live in [`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)s and [`Set`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set)s. A `Map` has no inherited keys (a wire named `constructor` is fine), accepts symbol keys, and remembers insertion order, which is how "newest driver" works. Its entries aren't object properties, though: `{ ...map }` is `{}` and `for…in` sees nothing. Use `[...map]` and `for (const [key, value] of map)`. TypeScript doesn't catch the object-spread mistake.

Docs: [Objects vs. maps](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map#objects_vs._maps), [for…of](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...of)

## Private state through a closure

```ts
export function createCircuit(schematic: Schematic = {}, env: CircuitEnv = defaultEnv): Circuit {
	const wires = new Map<string, Wire>();
	const probes = new Map<string, Set<Probe>>();
	// …buses, installs, baselines…
	const circuit: Circuit = { measure, probe /* … */ };
	install(schematic);
	return circuit;
}
```

Everything is a local variable of `createCircuit`. The returned methods can still reach those variables, but nothing else can. That's a **closure**, and it's what makes the store the single source of truth. Each `createCircuit()` call makes an independent circuit, which the tests rely on.

Docs: [Closures](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures)

## The one way in: `update`

A wire's `reading` is a cache of `resolve(wire)`, so every change to the inputs must recompute it. Every write goes through one function:

```ts
function update(name: string, mutate: (wire: Wire) => void): void {
	transact(() => {
		const wire = ensure(name); // create the record on first use
		touch(name); // remember the reading from before this operation
		const wasPowered = wire.reading.powered;
		mutate(wire); // change the inputs
		wire.reading = resolve(wire); // recompute the reading
		if (wire.reading.powered !== wasPowered) arbitrate(name, wire.reading.powered);
	});
}
```

An input changed anywhere else leaves a stale reading, skips the bus, and tells no probe. That includes callbacks that run **later**, such as a timer. They call `update` again when they fire.

## Latching: `power`, `toggle`, `setSignal`, `trip`

- **`power(name, true)`** sets the latch. **`setSignal`** sets the latched signal.
- **`trip(name)`** clears the latch and marks every driver `cut`. A cut driver stops counting until it's released and driven again. That's how Escape closes a hover menu while the pointer is still over it. **`power(name, false)`** trips.
- **`toggle`** trips a powered wire, or latches an unpowered one.

## Drivers: `drive` and `release`

```ts
engaged: existing?.engaged || !options.sustainOnly || wire.reading.powered,
```

- **`drive`** deletes and re-inserts the driver, so it becomes the newest entry in the `Map`. It cancels any delayed release that was waiting, and keeps `cut` if the driver was cut.
- **Sustain-only drivers** (`GHold`) are **engaged** only if the wire was already on when they asserted. They can keep a wire on but never turn it on.
- **`release(name, id, { delay })`** removes the driver at once, or after `delay` ms through `env.setTimeout`. A new release replaces a waiting one. A driver that isn't engaged, or is cut, holds nothing, so it's removed at once. When the timer fires, the removal is its own `update`, and it removes the driver only if the wire still holds **that** `Driver` object.

Docs: [setTimeout](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout), [clearTimeout](https://developer.mozilla.org/en-US/docs/Web/API/Window/clearTimeout)

## Buses: `arbitrate` and `pullUp`

`update` calls `arbitrate` whenever a wire's power flips. If the wire is on a bus, `arbitrate` restores the bus's rules:

- **A member powered on:** trip every **other** member that's on, so one conducts at a time. That's bus arbitration, and the [radio group](https://www.w3.org/WAI/ARIA/apg/patterns/radio/) pattern.
- **A member powered off:** `pullUp(bus)` latches the pullup if every member is now off.

These calls go back through `update`, so they **cascade**. Each one has to end. Trace `power(pullup, false)`: the pullup trips, the bus is all off, `pullUp` latches it again, and the other members are already off, so nothing more happens. Skipping the member that triggered the change matters: tripping it would bounce between off and the pullup forever.

`validate` runs before a schematic installs. It rejects a pullup that isn't a member, a wire on two buses, two members starting powered, and a bus reinstalled with different wires.

## Probes and propagation

A single operation can change several wires. `power('design', true)` turns `design` on and trips `program`. If probes ran inside each `update`, a probe on `design` would run while `program` was still on. It would see the bus with two members on, a state the bus never really has. Probes would also hear about wires that change and change back, like a pullup tripped and immediately latched again.

So the store **batches**: it records, settles, and then propagates.

| Phase         | What happens                                                                                                            | Code                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Record**    | The first time an operation touches a wire, keep its reading from before as a **baseline**.                             | `touch` adds `name → reading` to `baselines` |
| **Settle**    | Run the whole operation, including every cascade. No probe runs yet.                                                    | `transact` counts nesting in `depth`         |
| **Propagate** | When the outermost operation ends, compare each baseline with the wire's reading now. Probe only the wires that differ. | `propagate`                                  |

`touch` records only the **first** time, so a wire that changes three times in one operation is compared from start to end. Every `update`, including those a cascade triggers, runs inside `transact`. Only the call that brings `depth` back to `0` propagates.

### Trace: `power('b', true)`, bus `[a, b]` with `a` on

| Step | Call                                            | `depth` | `baselines`         | Probes hear                         |
| ---- | ----------------------------------------------- | ------- | ------------------- | ----------------------------------- |
| 1    | `update('b')` → `transact`                      | 1       | `{}`                |                                     |
| 2    | `touch('b')`, latch set, `b` resolves on        | 1       | `{ b: off }`        |                                     |
| 3    | `arbitrate('b', true)` → `trip('a')` → `update` | 2       | `{ b: off }`        |                                     |
| 4    | `touch('a')`, latch cleared, `a` resolves off   | 2       | `{ b: off, a: on }` |                                     |
| 5    | `arbitrate('a', false)` → `pullUp`: no pullup   | 2       | unchanged           |                                     |
| 6    | inner `transact` exits                          | 1       | unchanged           |                                     |
| 7    | outer `transact` exits → `propagate()`          | 0       | emptied             | `b` (off → on), then `a` (on → off) |

### Inside `propagate`

```ts
function propagate(): void {
	propagating = true;
	try {
		while (baselines.size > 0) {
			const round = [...baselines];
			baselines.clear();
			for (const [name, before] of round) {
				if (sameReading(before, measure(name))) {
					const wire = wires.get(name);
					if (wire) wire.reading = before;
					continue;
				}
				for (const probe of [...(probes.get(name) ?? [])]) probe();
				for (const probe of [...allProbes]) probe(name);
			}
		}
	} finally {
		propagating = false;
	}
}
```

- **Probes may change wires.** That runs `transact` again. The `propagating` flag stops it from starting a second propagation **inside** this one. The change waits in `baselines`, and the `while` loop handles it as the next round, so older changes always go out before newer ones.
- **Empty the queue before probing.** Because `touch` records only once, a probe that changes a wire already in this round would otherwise get no fresh baseline, and its change would never go out.
- **Unchanged wires get their original object back.** A pullup that was tripped and latched again has equal values but a new object. Restoring `before` keeps identity-based readers from seeing a change that didn't happen.
- **Probe from copies.** A `Set` visits entries added during iteration and skips ones deleted before they're reached. Copying fixes who is probed to whoever was attached when this wire's turn began.
- **`finally`** resets the flag even if a probe throws. Otherwise the circuit would never propagate again.

The same idea appears as [`batch()` in Preact Signals](https://preactjs.com/guide/v10/signals/#batchfn), as [actions in MobX](https://mobx.js.org/actions.html), and as React's own [state batching](https://react.dev/learn/queueing-a-series-of-state-updates).

Docs: [try…finally](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/try...catch#the_finally_block), [Set iteration](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/forEach)

## Schematics: `install`

`install(schematic)` is how `<GCircuit>` and `<GScope>` add wires and buses, and it returns an **uninstall** function. Installs are reference-counted. The first install of a wire applies its starting state, later ones only count, and the last uninstall forgets the wire, clearing its pending timers. Counting makes installing twice harmless, which matters because React's StrictMode mounts effects twice in development, and `GScope` will install during render as well as in an effect. A new bus calls `pullUp` once, which is how a pullup starts on.

## Edges: `rising`, `falling`, and holds

A panel that fades out must stay visible until the fade finishes, even though its wire is already off. So a measurement carries an `edge` beside `powered`:

```
off ──power on──▶ rising ──settles──▶ on ──power off──▶ falling ──settles──▶ off
```

`powered` changes at once, and `edge` says whether anything is still animating. CSS can then keep a closing element shown during `falling` (`hidden g-on:block g-falling:block`).

**Who decides when an edge settles?** The loads that animate. A load reads its own transition time when the edge starts, calls `const done = circuit.holdEdge(wire)`, and calls `done()` when its transition ends. The edge settles when **both** of these are true:

1. **One frame has passed** since it began. Loads take their holds while React commits, which is before the next frame, so a wire with no animated loads still gives them a chance. Then it settles on that frame.
2. **Every hold is let go.**

Each `Wire` keeps four fields for this:

| Field        | Meaning                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------- |
| `edge`       | The current phase, copied into the measurement by `resolve`                                  |
| `generation` | Counts edges, so a `done()` or frame from an earlier edge can tell it's stale and do nothing |
| `holds`      | Holds on the current edge not yet let go                                                     |
| `frame`      | The pending frame callback, until it runs                                                    |

`beginEdge` starts an edge: it bumps `generation`, clears `holds`, cancels the old frame, sets `rising` or `falling`, and asks `env.requestFrame` for a new frame. `settle(name, generation)` runs after the frame and after each `done()`. It changes the edge to `on` or `off` (through `update`, so probes hear about it) only when the generation still matches, the frame has run, and no holds remain.

**Reversal.** If the power changes mid-edge, a new edge begins at once, in the other direction. CSS transitions reverse from wherever they are, so nothing waits for the first edge. Holds from the earlier edge belong to an older generation, so their `done()` calls are ignored.

**When edges begin.** `propagate` begins them, once per operation, by comparing each wire's power with its baseline. So power that flips and flips back within one operation, like a pullup tripped and re-latched, starts no edge at all. While a schematic is installing, edges settle immediately instead: a menu that starts open is `on` in the prerendered HTML, not `rising`.

| Test                                                           | Rule                             |
| -------------------------------------------------------------- | -------------------------------- |
| rises when powered, then settles on the next frame…            | no holds: settle on the frame    |
| waits for every hold before settling                           | holds are counted                |
| waits for the frame even when every hold finishes first        | both conditions                  |
| reverses at once when the power changes mid-edge…              | generations make old holds stale |
| starts no edge when the power ends an operation where it began | edges are judged per operation   |
| starts installed wires settled, pullups included               | starting states don't animate    |

## Connections: the registry

[`registry.ts`](../../src/core/registry.ts) records what is connected to each wire: parts, inputs, and loads, each with a `label` and, in the browser, its element. Every circuit includes one, so `circuit.connect(wire, connection)` returns a function that disconnects it, and `circuit.connections(wire)` lists them.

It's kept apart from wire probes on purpose. Components connect when they mount, and if that counted as a wire change, every reader of the wire would re-render on every mount. Instead, `probeConnections` tells the overlay when the wiring changes. `connections` returns the same frozen array until that wire's connections change, so it's safe to use as a React snapshot too.

## Timers and frames: `env`

`createCircuit(schematic, env)` takes the timers and frames it uses. It defaults to the host's `setTimeout`/`clearTimeout` and `requestAnimationFrame`/`cancelAnimationFrame` through `globalThis`, falling back to a 16 ms timer where there are no frames (Node, prerendering), so `core/` never names `window`. Tests pass a fake clock ([Vitest fake timers](https://vitest.dev/guide/mocking/timers)) or their own `env`. The edge tests use an `env` whose frames run only when the test says so.

## How React will use it

`useSyncExternalStore(subscribe, getSnapshot)` needs a function that attaches a callback and returns its cleanup, and a snapshot that stays the **same object** until something changes. `probe` and `measure` provide both:

```ts
function useWire(circuit: Circuit, wire: string): Measurement {
	return useSyncExternalStore(
		(onChange) => circuit.probe(wire, onChange),
		() => circuit.measure(wire),
	);
}
```

React compares snapshots with `Object.is`, which is why identical readings keep their identity.

Docs: [useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore), [Object.is](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is)

## The tests

[`circuit.test.ts`](../../src/core/circuit.test.ts) states each rule in plain words, grouped as measuring, latch, drivers, sustain-only drivers, trip, delayed release, notifications, schematics, buses, and edges. The registry has its own `registry.test.ts`. Delayed releases run on Vitest's fake timers (`vi.useFakeTimers()`, `vi.advanceTimersByTime(ms)`), so they're instant and exact. When you add a behavior, add the test that states it first.
