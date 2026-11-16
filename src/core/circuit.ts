/**
 * The circuit store: the single source of truth for every wire's power and signal.
 * Framework-free by design, so React (and, later, custom elements) are thin adapters over it.
 * The resolution rules are specified in docs/PLAN.md §2.
 */

export type Signal = string | null;

export interface WireState {
	/** The latch is set, or at least one active driver counts and isn't cut. */
	readonly powered: boolean;
	/** The newest counting driver's signal, else the latched signal. */
	readonly signal: Signal;
	/** Whether the wire has ever been powered. Content that loads on first use reads this. */
	readonly everPowered: boolean;
}

export interface WireDeclaration {
	readonly powered?: boolean;
	readonly signal?: string;
}

export interface BusDeclaration {
	/** Member wires. Only one of them conducts at a time. */
	readonly wires: readonly string[];
	/** The member that powers on whenever every member is off. */
	readonly pullup?: string;
}

export interface CircuitDeclarations {
	readonly wires?: Readonly<Record<string, WireDeclaration>>;
	readonly buses?: Readonly<Record<string, BusDeclaration>>;
}

export interface DriveOptions {
	/** A signal carried while this driver is active. */
	readonly signal?: string;
	/** Only keep an already-powered wire on; never turn it on. */
	readonly sustainOnly?: boolean;
}

export interface ReleaseOptions {
	/** Keep the driver active this many milliseconds longer. Driving again cancels the release. */
	readonly delay?: number;
}

/** The timers core needs, injectable so tests (and other hosts) control time. */
export interface CircuitEnv {
	setTimeout(callback: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

export type Listener = () => void;
export type WireListener = (wire: string) => void;

export interface Circuit {
	/** Current state of a wire. Identity-stable until the wire actually changes. */
	read(wire: string): WireState;
	/** Subscribe to one wire's changes. Returns an unsubscribe function. */
	subscribe(wire: string, listener: Listener): () => void;
	/** Subscribe to every wire's changes. Returns an unsubscribe function. */
	subscribeAll(listener: WireListener): () => void;

	/** Set the latch, or (with `false`) hard-off the wire: clear the latch and cut every driver. */
	power(wire: string, on: boolean): void;
	/** Hard-off a powered wire, or latch an unpowered one. */
	toggle(wire: string): void;
	/** Set the latched signal. */
	setSignal(wire: string, signal: Signal): void;

	/** Assert a momentary driver. Asserting again makes it the newest. */
	drive(wire: string, driver: symbol, options?: DriveOptions): void;
	/** Release a momentary driver, optionally after a delay. */
	release(wire: string, driver: symbol, options?: ReleaseOptions): void;

	/**
	 * Declare wires' starting states and buses. Declarations are reference-counted: the first one
	 * applies starting states, and the returned function removes this one (and, with the last
	 * reference, the wire's state).
	 */
	declare(declarations: CircuitDeclarations): () => void;
}

interface Driver {
	readonly signal: string | undefined;
	readonly counts: boolean;
	cut: boolean;
	releaseTimer: unknown;
}

interface WireRecord {
	latch: boolean;
	latchedSignal: Signal;
	/** In assertion order, so the last entry is the newest. */
	readonly drivers: Map<symbol, Driver>;
	snapshot: WireState;
}

interface Bus {
	readonly wires: readonly string[];
	readonly pullup: string | undefined;
	references: number;
}

const OFF: WireState = Object.freeze({ powered: false, signal: null, everPowered: false });

const host = globalThis as unknown as CircuitEnv;
const defaultEnv: CircuitEnv = {
	setTimeout: (callback, ms) => host.setTimeout(callback, ms),
	clearTimeout: (handle) => host.clearTimeout(handle),
};

function sameState(a: WireState, b: WireState): boolean {
	return (
		a === b || (a.powered === b.powered && a.signal === b.signal && a.everPowered === b.everPowered)
	);
}

function resolve(record: WireRecord): WireState {
	let powered = record.latch;
	let driven: string | undefined;
	for (const driver of record.drivers.values()) {
		if (!driver.counts || driver.cut) continue;
		powered = true;
		if (driver.signal !== undefined) driven = driver.signal;
	}
	const next: WireState = {
		powered,
		signal: driven ?? record.latchedSignal,
		everPowered: record.snapshot.everPowered || powered,
	};
	return sameState(next, record.snapshot) ? record.snapshot : Object.freeze(next);
}

export function createCircuit(
	declarations: CircuitDeclarations = {},
	env: CircuitEnv = defaultEnv,
): Circuit {
	const wires = new Map<string, WireRecord>();
	const listeners = new Map<string, Set<Listener>>();
	const allListeners = new Set<WireListener>();
	const declared = new Map<string, number>();
	const buses = new Map<string, Bus>();
	const busOf = new Map<string, Bus>();

	/** Wires changed in the current operation, with their state before it began. */
	const pending = new Map<string, WireState>();
	let depth = 0;
	let flushing = false;

	const read = (name: string): WireState => wires.get(name)?.snapshot ?? OFF;

	function ensure(name: string): WireRecord {
		let record = wires.get(name);
		if (!record) {
			record = { latch: false, latchedSignal: null, drivers: new Map(), snapshot: OFF };
			wires.set(name, record);
		}
		return record;
	}

	function touch(name: string): void {
		if (!pending.has(name)) pending.set(name, read(name));
	}

	/**
	 * Notify listeners of every wire that ended an operation in a different state. Changes made by
	 * listeners land in `pending` (`transact` won't flush while this runs) and go out in later rounds.
	 */
	function flush(): void {
		flushing = true;
		try {
			while (pending.size > 0) {
				// Empty the queue first, so a listener's change gets a fresh entry for the next round.
				const round = [...pending];
				pending.clear();
				for (const [name, before] of round) {
					if (sameState(before, read(name))) {
						// Hand back the original object, so identity-based readers see no change.
						const record = wires.get(name);
						if (record) record.snapshot = before;
						continue;
					}
					// Copies: listeners may subscribe or unsubscribe while being notified.
					for (const listener of [...(listeners.get(name) ?? [])]) listener();
					for (const listener of [...allListeners]) listener(name);
				}
			}
		} finally {
			flushing = false;
		}
	}

	/** Run one operation. Listeners hear about it once, after every wire it touches has settled. */
	function transact(operation: () => void): void {
		depth++;
		try {
			operation();
		} finally {
			depth--;
			if (depth === 0 && !flushing) flush();
		}
	}

	function update(name: string, mutate: (record: WireRecord) => void): void {
		transact(() => {
			const record = ensure(name);
			touch(name);
			const wasPowered = record.snapshot.powered;
			mutate(record);
			record.snapshot = resolve(record);
			if (record.snapshot.powered !== wasPowered) onPowerChange(name, record.snapshot.powered);
		});
	}

	function hardOff(name: string): void {
		update(name, (record) => {
			record.latch = false;
			for (const driver of record.drivers.values()) driver.cut = true;
		});
	}

	/** Keep a bus valid after one of its members changed power: one member on, or the pullup. */
	function onPowerChange(name: string, powered: boolean): void {
		const bus = busOf.get(name);
		if (!bus) return;
		if (!powered) return pullUp(bus);
		for (const member of bus.wires) {
			if (member !== name && read(member).powered) hardOff(member);
		}
	}

	function pullUp(bus: Bus): void {
		if (bus.pullup === undefined || bus.wires.some((member) => read(member).powered)) return;
		update(bus.pullup, (record) => {
			record.latch = true;
		});
	}

	function validate({ wires: wireDecls = {}, buses: busDecls = {} }: CircuitDeclarations): void {
		const claimed = new Map<string, string>();
		for (const [busName, bus] of Object.entries(busDecls)) {
			const existing = buses.get(busName);
			if (existing) {
				const same =
					existing.pullup === bus.pullup &&
					existing.wires.length === bus.wires.length &&
					existing.wires.every((member, i) => member === bus.wires[i]);
				if (!same) throw new Error(`Bus "${busName}" is already declared with different wires.`);
				continue;
			}
			if (bus.pullup !== undefined && !bus.wires.includes(bus.pullup)) {
				throw new Error(`Bus "${busName}": pullup "${bus.pullup}" isn't one of its wires.`);
			}
			for (const member of bus.wires) {
				const owner = busOf.get(member) ? 'another bus' : claimed.get(member);
				if (owner !== undefined) {
					throw new Error(
						`Wire "${member}" can't join bus "${busName}": it's already on ${owner}.`,
					);
				}
				claimed.set(member, `bus "${busName}"`);
			}
			const powered = bus.wires.filter((member) => wireDecls[member]?.powered);
			if (powered.length > 1) {
				throw new Error(
					`Bus "${busName}": only one wire may start powered (${powered.join(', ')}).`,
				);
			}
		}
	}

	function declare(decls: CircuitDeclarations): () => void {
		validate(decls);
		const wireEntries = Object.entries(decls.wires ?? {});
		const busEntries = Object.entries(decls.buses ?? {});

		transact(() => {
			for (const [name, decl] of wireEntries) {
				const references = declared.get(name) ?? 0;
				declared.set(name, references + 1);
				if (references > 0 || wires.has(name)) continue;
				update(name, (record) => {
					record.latch = decl.powered ?? false;
					record.latchedSignal = decl.signal ?? null;
				});
			}
			for (const [busName, decl] of busEntries) {
				const existing = buses.get(busName);
				if (existing) {
					existing.references++;
					continue;
				}
				const bus: Bus = { wires: [...decl.wires], pullup: decl.pullup, references: 1 };
				buses.set(busName, bus);
				for (const member of bus.wires) busOf.set(member, bus);
				pullUp(bus);
			}
		});

		let removed = false;
		return () => {
			if (removed) return;
			removed = true;
			transact(() => {
				for (const [busName] of busEntries) {
					const bus = buses.get(busName);
					if (!bus || --bus.references > 0) continue;
					buses.delete(busName);
					for (const member of bus.wires) busOf.delete(member);
				}
				for (const [name] of wireEntries) {
					const references = (declared.get(name) ?? 1) - 1;
					if (references > 0) {
						declared.set(name, references);
						continue;
					}
					declared.delete(name);
					const record = wires.get(name);
					if (!record) continue;
					touch(name);
					for (const driver of record.drivers.values()) env.clearTimeout(driver.releaseTimer);
					wires.delete(name);
				}
			});
		};
	}

	const circuit: Circuit = {
		read,

		subscribe(name, listener) {
			let set = listeners.get(name);
			if (!set) listeners.set(name, (set = new Set()));
			set.add(listener);
			return () => {
				set.delete(listener);
				if (set.size === 0 && listeners.get(name) === set) listeners.delete(name);
			};
		},

		subscribeAll(listener) {
			allListeners.add(listener);
			return () => allListeners.delete(listener);
		},

		power(name, on) {
			if (!on) return hardOff(name);
			update(name, (record) => {
				record.latch = true;
			});
		},

		toggle(name) {
			circuit.power(name, !read(name).powered);
		},

		setSignal(name, signal) {
			update(name, (record) => {
				record.latchedSignal = signal;
			});
		},

		drive(name, id, options = {}) {
			update(name, (record) => {
				const existing = record.drivers.get(id);
				if (existing) env.clearTimeout(existing.releaseTimer);
				record.drivers.delete(id);
				record.drivers.set(id, {
					signal: options.signal,
					counts: existing?.counts || !options.sustainOnly || record.snapshot.powered,
					cut: existing?.cut ?? false,
					releaseTimer: undefined,
				});
			});
		},

		release(name, id, options = {}) {
			const driver = wires.get(name)?.drivers.get(id);
			if (!driver) return;
			// Any earlier delayed release is replaced, whether or not this one waits.
			env.clearTimeout(driver.releaseTimer);
			driver.releaseTimer = undefined;
			// Removes this driver only: the same symbol may have been driven again since.
			const remove = () =>
				update(name, (record) => {
					if (record.drivers.get(id) === driver) record.drivers.delete(id);
				});
			// A driver that doesn't count is holding nothing, so there's nothing to delay.
			if (!options.delay || driver.cut || !driver.counts) return remove();
			driver.releaseTimer = env.setTimeout(() => {
				driver.releaseTimer = undefined;
				if (wires.get(name)?.drivers.get(id) === driver) remove();
			}, options.delay);
		},
		declare,
	};

	declare(declarations);
	return circuit;
}
