/**
 * The circuit store: the single source of truth for every wire's power and signal.
 * Framework-free by design, so React (and, later, custom elements) are thin adapters over it.
 * The resolution rules are specified in docs/PLAN.md §2.
 */

export type Signal = string | null;

export interface Measurement {
	/** The latch is set, or at least one active driver is engaged and isn't cut. */
	readonly powered: boolean;
	/** The newest engaged driver's signal, else the latched signal. */
	readonly signal: Signal;
	/** Whether the wire has ever been powered. Content that loads on first use reads this. */
	readonly everPowered: boolean;
}

export interface WireSpec {
	readonly powered?: boolean;
	readonly signal?: string;
}

export interface BusSpec {
	/** Member wires. Only one of them conducts at a time. */
	readonly wires: readonly string[];
	/** The member that powers on whenever every member is off. */
	readonly pullup?: string;
}

export interface Schematic {
	readonly wires?: Readonly<Record<string, WireSpec>>;
	readonly buses?: Readonly<Record<string, BusSpec>>;
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

export type Probe = () => void;
export type WireProbe = (wire: string) => void;

export interface Circuit {
	/** Measure a wire. The same object comes back until the wire actually changes. */
	measure(wire: string): Measurement;
	/** Attach a probe to one wire. Returns a function that detaches it. */
	probe(wire: string, probe: Probe): () => void;
	/** Attach a probe to every wire. It receives the name of the wire that changed. */
	probeAll(probe: WireProbe): () => void;

	/** Set the latch, or (with `false`) trip the wire: clear the latch and cut every driver. */
	power(wire: string, on: boolean): void;
	/** Clear the latch and cut every driver, like a breaker. A cut driver stays off until it is released and driven again. */
	trip(wire: string): void;
	/** Trip a powered wire, or latch an unpowered one. */
	toggle(wire: string): void;
	/** Set the latched signal. */
	setSignal(wire: string, signal: Signal): void;

	/** Assert a momentary driver. Asserting again makes it the newest. */
	drive(wire: string, driver: symbol, options?: DriveOptions): void;
	/** Release a momentary driver, optionally after a delay. */
	release(wire: string, driver: symbol, options?: ReleaseOptions): void;

	/**
	 * Install a schematic: wires' starting states and buses. Installs are reference-counted: the
	 * first applies starting states, and the returned function uninstalls this one (and, with the
	 * last install, forgets the wire's state).
	 */
	install(schematic: Schematic): () => void;
}

interface Driver {
	readonly signal: string | undefined;
	readonly engaged: boolean;
	cut: boolean;
	releaseTimer: unknown;
}

interface Wire {
	latch: boolean;
	latchedSignal: Signal;
	/** In assertion order, so the last entry is the newest. */
	readonly drivers: Map<symbol, Driver>;
	reading: Measurement;
}

interface Bus {
	readonly wires: readonly string[];
	readonly pullup: string | undefined;
	references: number;
}

const OFF: Measurement = Object.freeze({ powered: false, signal: null, everPowered: false });

const host = globalThis as unknown as CircuitEnv;
const defaultEnv: CircuitEnv = {
	setTimeout: (callback, ms) => host.setTimeout(callback, ms),
	clearTimeout: (handle) => host.clearTimeout(handle),
};

function sameReading(a: Measurement, b: Measurement): boolean {
	return (
		a === b || (a.powered === b.powered && a.signal === b.signal && a.everPowered === b.everPowered)
	);
}

function resolve(wire: Wire): Measurement {
	let powered = wire.latch;
	let driven: string | undefined;
	for (const driver of wire.drivers.values()) {
		if (!driver.engaged || driver.cut) continue;
		powered = true;
		if (driver.signal !== undefined) driven = driver.signal;
	}
	const next: Measurement = {
		powered,
		signal: driven ?? wire.latchedSignal,
		everPowered: wire.reading.everPowered || powered,
	};
	return sameReading(next, wire.reading) ? wire.reading : Object.freeze(next);
}

export function createCircuit(schematic: Schematic = {}, env: CircuitEnv = defaultEnv): Circuit {
	const wires = new Map<string, Wire>();
	const probes = new Map<string, Set<Probe>>();
	const allProbes = new Set<WireProbe>();
	const installs = new Map<string, number>();
	const buses = new Map<string, Bus>();
	const busOf = new Map<string, Bus>();

	/** Wires changed in the current operation, with their measurement from before it began. */
	const baselines = new Map<string, Measurement>();
	let depth = 0;
	let propagating = false;

	const measure = (name: string): Measurement => wires.get(name)?.reading ?? OFF;

	function ensure(name: string): Wire {
		let wire = wires.get(name);
		if (!wire) {
			wire = { latch: false, latchedSignal: null, drivers: new Map(), reading: OFF };
			wires.set(name, wire);
		}
		return wire;
	}

	function touch(name: string): void {
		if (!baselines.has(name)) baselines.set(name, measure(name));
	}

	/**
	 * Notify probes of every wire that ended an operation in a different state. Changes made by
	 * probes land in `baselines` (`transact` won't propagate while this runs) and go out in later
	 * rounds.
	 */
	function propagate(): void {
		propagating = true;
		try {
			while (baselines.size > 0) {
				// Empty the queue first, so a probe's change gets a fresh entry for the next round.
				const round = [...baselines];
				baselines.clear();
				for (const [name, before] of round) {
					if (sameReading(before, measure(name))) {
						// Hand back the original object, so identity-based readers see no change.
						const wire = wires.get(name);
						if (wire) wire.reading = before;
						continue;
					}
					// Copies: probes may attach or detach probes while being notified.
					for (const probe of [...(probes.get(name) ?? [])]) probe();
					for (const probe of [...allProbes]) probe(name);
				}
			}
		} finally {
			propagating = false;
		}
	}

	/** Run one operation. Probes hear about it once, after every wire it touches has settled. */
	function transact(operation: () => void): void {
		depth++;
		try {
			operation();
		} finally {
			depth--;
			if (depth === 0 && !propagating) propagate();
		}
	}

	function update(name: string, mutate: (wire: Wire) => void): void {
		transact(() => {
			const wire = ensure(name);
			touch(name);
			const wasPowered = wire.reading.powered;
			mutate(wire);
			wire.reading = resolve(wire);
			if (wire.reading.powered !== wasPowered) arbitrate(name, wire.reading.powered);
		});
	}

	function trip(name: string): void {
		update(name, (wire) => {
			wire.latch = false;
			for (const driver of wire.drivers.values()) driver.cut = true;
		});
	}

	/** Keep a bus valid after one of its members changed power: one member on, or the pullup. */
	function arbitrate(name: string, powered: boolean): void {
		const bus = busOf.get(name);
		if (!bus) return;
		if (!powered) return pullUp(bus);
		for (const member of bus.wires) {
			if (member !== name && measure(member).powered) trip(member);
		}
	}

	function pullUp(bus: Bus): void {
		if (bus.pullup === undefined || bus.wires.some((member) => measure(member).powered)) return;
		update(bus.pullup, (wire) => {
			wire.latch = true;
		});
	}

	function validate({ wires: wireSpecs = {}, buses: busSpecs = {} }: Schematic): void {
		const claimed = new Map<string, string>();
		for (const [busName, bus] of Object.entries(busSpecs)) {
			const existing = buses.get(busName);
			if (existing) {
				const same =
					existing.pullup === bus.pullup &&
					existing.wires.length === bus.wires.length &&
					existing.wires.every((member, i) => member === bus.wires[i]);
				if (!same) throw new Error(`Bus "${busName}" is already installed with different wires.`);
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
			const powered = bus.wires.filter((member) => wireSpecs[member]?.powered);
			if (powered.length > 1) {
				throw new Error(
					`Bus "${busName}": only one wire may start powered (${powered.join(', ')}).`,
				);
			}
		}
	}

	function install(schematic: Schematic): () => void {
		validate(schematic);
		const wireEntries = Object.entries(schematic.wires ?? {});
		const busEntries = Object.entries(schematic.buses ?? {});

		transact(() => {
			for (const [name, spec] of wireEntries) {
				const references = installs.get(name) ?? 0;
				installs.set(name, references + 1);
				if (references > 0 || wires.has(name)) continue;
				update(name, (wire) => {
					wire.latch = spec.powered ?? false;
					wire.latchedSignal = spec.signal ?? null;
				});
			}
			for (const [busName, spec] of busEntries) {
				const existing = buses.get(busName);
				if (existing) {
					existing.references++;
					continue;
				}
				const bus: Bus = { wires: [...spec.wires], pullup: spec.pullup, references: 1 };
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
					const references = (installs.get(name) ?? 1) - 1;
					if (references > 0) {
						installs.set(name, references);
						continue;
					}
					installs.delete(name);
					const wire = wires.get(name);
					if (!wire) continue;
					touch(name);
					for (const driver of wire.drivers.values()) env.clearTimeout(driver.releaseTimer);
					wires.delete(name);
				}
			});
		};
	}

	const circuit: Circuit = {
		measure,

		probe(name, probe) {
			let set = probes.get(name);
			if (!set) probes.set(name, (set = new Set()));
			set.add(probe);
			return () => {
				set.delete(probe);
				if (set.size === 0 && probes.get(name) === set) probes.delete(name);
			};
		},

		probeAll(probe) {
			allProbes.add(probe);
			return () => allProbes.delete(probe);
		},

		trip,

		power(name, on) {
			if (!on) return trip(name);
			update(name, (wire) => {
				wire.latch = true;
			});
		},

		toggle(name) {
			circuit.power(name, !measure(name).powered);
		},

		setSignal(name, signal) {
			update(name, (wire) => {
				wire.latchedSignal = signal;
			});
		},

		drive(name, id, options = {}) {
			update(name, (wire) => {
				const existing = wire.drivers.get(id);
				if (existing) env.clearTimeout(existing.releaseTimer);
				wire.drivers.delete(id);
				wire.drivers.set(id, {
					signal: options.signal,
					engaged: existing?.engaged || !options.sustainOnly || wire.reading.powered,
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
				update(name, (wire) => {
					if (wire.drivers.get(id) === driver) wire.drivers.delete(id);
				});
			// A driver that isn't engaged is holding nothing, so there's nothing to delay.
			if (!options.delay || driver.cut || !driver.engaged) return remove();
			driver.releaseTimer = env.setTimeout(() => {
				driver.releaseTimer = undefined;
				if (wires.get(name)?.drivers.get(id) === driver) remove();
			}, options.delay);
		},
		install,
	};

	install(schematic);
	return circuit;
}
