import type { WireProbe } from './circuit.js';

export type ConnectionKind = 'part' | 'input' | 'receiver';

/** Something connected to a wire. The overlay draws these, and inputs find their receivers here. */
export interface Connection {
	readonly kind: ConnectionKind;
	/** A short human-readable name, such as the part's name. */
	readonly label: string;
	/** The DOM element, when there is one. Core never looks inside it. */
	readonly element?: unknown;
}

export interface Registry {
	/** Connect something to a wire. Returns a function that disconnects it. */
	connect(wirePath: string, connection: Connection): () => void;
	/** Everything connected to a wire, in connection order. The same array until it changes. */
	connections(wirePath: string): readonly Connection[];
	/** Run a probe whenever any wire's connections change. Returns a function that detaches it. */
	probeConnections(probe: WireProbe): () => void;
}

const NONE: readonly Connection[] = Object.freeze([]);

export function createRegistry(): Registry {
	const lists = new Map<string, readonly Connection[]>();
	const probes = new Set<WireProbe>();

	function replace(wirePath: string, list: readonly Connection[]): void {
		if (list.length === 0) lists.delete(wirePath);
		else lists.set(wirePath, Object.freeze(list));
		for (const probe of [...probes]) probe(wirePath);
	}

	return {
		connect(wirePath, connection) {
			// A copy per call has its own identity, so each disconnect removes only its own.
			const entry = Object.freeze({ ...connection });
			const list = [...(lists.get(wirePath) ?? NONE), entry];
			replace(wirePath, list);
			let connected = true;
			return () => {
				if (!connected) return;
				connected = false;
				replace(
					wirePath,
					(lists.get(wirePath) ?? NONE).filter((listEntry) => listEntry !== entry),
				);
			};
		},

		connections: (wirePath) => lists.get(wirePath) ?? NONE,

		probeConnections(probe) {
			probes.add(probe);
			return () => probes.delete(probe);
		},
	};
}
