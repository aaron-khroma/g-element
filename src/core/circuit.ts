/**
 * The circuit store: the single source of truth for every wire's power and signal.
 * Framework-free by design, so React (and, later, custom elements) are thin adapters over it.
 * See docs/SPEC.md §2 and §2a.
 */

export interface WireState {
	readonly powered: boolean;
	readonly signal: string | null;
}

export type Listener = () => void;

const OFF: WireState = Object.freeze({ powered: false, signal: null });

export interface Circuit {
	/** Current state of a wire. Unknown wires read as unpowered with no signal. */
	read(wire: string): WireState;
	/** Drive a wire. Notifies subscribers only when the state actually changes. */
	drive(wire: string, next: Partial<WireState>): void;
	/** Subscribe to one wire's changes. Returns an unsubscribe function. */
	subscribe(wire: string, listener: Listener): () => void;
}

export function createCircuit(): Circuit {
	const wires = new Map<string, WireState>();
	const listeners = new Map<string, Set<Listener>>();

	return {
		read: (wire) => wires.get(wire) ?? OFF,
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
		subscribe(wire, listener) {
			let set = listeners.get(wire);
			if (!set) listeners.set(wire, (set = new Set()));
			set.add(listener);
			return () => set.delete(listener);
		},
	};
}
