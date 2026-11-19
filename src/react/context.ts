import { createContext, useContext } from 'react';
import type { Circuit } from '../core/index.js';
import type { Media } from './media.js';

/** What `<GCircuit>` shares with everything below it. Created once, so it never changes. */
export interface Board {
	readonly circuit: Circuit;
	readonly media: Media;
	/** Schematics installed by `<GDevice>`s, keyed by each device's `useId()`. */
	readonly installs: Map<string, () => void>;
}

export const BoardContext = createContext<Board | null>(null);

/** The current device's path (`'case-study'`, `'case-study/gallery'`), or `''` at the root. */
export const DeviceContext = createContext('');

/** The nearest `<GCircuit>`'s board. Throws outside one: there's no global circuit to fall back to. */
export function useBoard(): Board {
	const board = useContext(BoardContext);
	if (board === null) {
		throw new Error('GElement hooks and components must be used inside a <GCircuit>.');
	}
	return board;
}
