import { useCallback, useContext, useSyncExternalStore } from 'react';
import {
	resolveWirePath,
	type Circuit,
	type Edge,
	type Measurement,
	type Signal,
} from '../core/index.js';
import { DeviceContext, useBoard } from './context.js';

/** The circuit from the nearest `<GCircuit>`, for reading and changing wires from app code. */
export function useCircuit(): Circuit {
	return useBoard().circuit;
}

/**
 * A wire's path: its name, bundled into the current `<GDevice>`. Inside `case-study`, `'gallery'`
 * is `'case-study/gallery'`.
 */
export function useWirePath(wireName: string): string {
	return resolveWirePath(wireName, useContext(DeviceContext));
}

/**
 * Read one value from a wire's measurement, and re-render when that value changes. Reading a
 * single value (not the whole measurement) means a component that only shows power doesn't
 * re-render when the signal changes.
 */
function useReading<T>(wireName: string, read: (measurement: Measurement) => T): T {
	const circuit = useCircuit();
	const wirePath = useWirePath(wireName);

	// A probe already has the shape React subscribes with. Memoized, so React keeps one
	// subscription until the circuit or the wire path changes.
	const subscribe = useCallback(
		(onStoreChange: () => void) => circuit.probe(wirePath, onStoreChange),
		[circuit, wirePath],
	);

	// React compares snapshots with Object.is, so this must return the selected value, not the
	// whole measurement, or every change to the wire would re-render.
	const getSnapshot = () => read(circuit.measure(wirePath));

	// A prerender reads the same circuit, so the server snapshot is the same reading.
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const whole = (measurement: Measurement) => measurement;
const power = (measurement: Measurement) => measurement.powered;
const signal = (measurement: Measurement) => measurement.signal;
const edge = (measurement: Measurement) => measurement.edge;

/** A wire's whole measurement: power, signal, edge, and whether it has ever been powered. */
export function useWire(wireName: string): Measurement {
	return useReading(wireName, whole);
}

/** Whether a wire is powered. */
export function usePower(wireName: string): boolean {
	return useReading(wireName, power);
}

/** A wire's signal, or `null`. */
export function useSignal(wireName: string): Signal {
	return useReading(wireName, signal);
}

/** Where a wire is in its transition: `off`, `rising`, `on`, or `falling`. */
export function useEdge(wireName: string): Edge {
	return useReading(wireName, edge);
}
