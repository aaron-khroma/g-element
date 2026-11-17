export { createCircuit } from './circuit.js';
export type {
	BusSpec,
	Circuit,
	CircuitEnv,
	DriveOptions,
	Edge,
	Measurement,
	Probe,
	ReleaseOptions,
	Schematic,
	Signal,
	WireProbe,
	WireSpec,
} from './circuit.js';
export { resolveWire } from './names.js';
export { createRegistry } from './registry.js';
export type { Connection, ConnectionKind, Registry } from './registry.js';
export { DEFAULT_BREAKPOINTS, parseScope } from './scope.js';
export type { Breakpoints } from './scope.js';
export { parseTrigger } from './trigger.js';
export type { TriggerAction, TriggerEntry } from './trigger.js';
