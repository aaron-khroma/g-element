import { useState, type ReactNode } from 'react';
import {
	createCircuit,
	type Breakpoints,
	type BusSpec,
	type Schematic,
	type WireSpec,
} from '../core/index.js';
import { BoardContext, type Board } from './context.js';
import { createMedia, resolveBreakpoints } from './media.js';

export interface GCircuitProps {
	/** Wires' starting states: `{ menu: { powered: true }, theme: { signal: 'auto' } }`. */
	readonly wires?: Readonly<Record<string, WireSpec>>;
	/** Groups of wires where only one conducts at a time. */
	readonly buses?: Readonly<Record<string, BusSpec>>;
	/** Breakpoint widths, over Tailwind's defaults and the page's `--breakpoint-*` variables. */
	readonly breakpoints?: Breakpoints;
	readonly children?: ReactNode;
}

/**
 * Provides the circuit. It's created during the first render from `wires` and `buses`, so the
 * prerendered HTML already shows every starting state. Later changes to these props are ignored:
 * they're starting states, not controls. Give the `GCircuit` a new `key` to start over.
 */
export function GCircuit({ wires, buses, breakpoints, children }: GCircuitProps): ReactNode {
	// Built in the first render, not in an effect, because a prerender never runs effects. The lazy
	// initializer runs once, so later renders don't build (and throw away) another circuit.
	const [board] = useState(() =>
		createBoard(
			{
				...(wires !== undefined && { wires }),
				...(buses !== undefined && { buses }),
			},
			breakpoints,
		),
	);
	return <BoardContext value={board}>{children}</BoardContext>;
}

function createBoard(schematic: Schematic, breakpoints: Breakpoints | undefined): Board {
	return {
		circuit: createCircuit(schematic),
		media: createMedia(resolveBreakpoints(breakpoints)),
		installs: new Map(),
	};
}
