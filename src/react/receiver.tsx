import { useCallback, useLayoutEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import type { Edge } from '../core/index.js';
import { useBoard } from './context.js';
import { useWire, useWirePath } from './hooks.js';
import { holdWhileMoving } from './settle.js';
import { Slot } from './slot.js';

export interface ReceiverOptions {
	/** Make the element `inert` while the wire is off, so its contents can't be focused or clicked. */
	readonly inert?: boolean;
	/** A name for the overlay. Defaults to the element's `id`, else its tag name. */
	readonly label?: string;
}

/** Props for a receiver's element. Spread them onto it: `<nav {...useReceiver('menu')}>`. */
export interface ReceiverProps {
	readonly ref: (element: Element | null) => (() => void) | undefined;
	readonly 'data-g-power': 'on' | 'off';
	readonly 'data-g-edge': Edge;
	readonly 'data-g-signal'?: string;
	readonly inert?: true;
}

/**
 * Connect an element to a wire as a receiver. It shows the wire's state in `data-g-*` attributes, for
 * CSS to style, and holds the wire's edges while its own transitions run, so a closing element
 * stays `falling` (and visible) until it has finished animating out.
 */
export function useReceiver(wireName: string, options: ReceiverOptions = {}): ReceiverProps {
	const { circuit } = useBoard();
	const wirePath = useWirePath(wireName);
	const { powered, signal, edge } = useWire(wireName);
	// The element, once React has attached it, for the edge effect below.
	const element = useRef<Element | null>(null);
	const { label } = options;

	// Connects the element to the wire in the registry for as long as it's attached. React calls
	// this with the element after attaching it, and calls the function it returns when detaching.
	// Memoized: a new function each render would make React detach and reattach it every time.
	const ref = useCallback(
		(receiver: Element | null) => {
			// A ref callback that returns a cleanup is never called with null, but the type allows it.
			if (receiver === null) return undefined;
			element.current = receiver;

			const disconnect = circuit.connect(wirePath, {
				kind: 'receiver',
				label: label ?? (receiver.id || receiver.tagName.toLowerCase()),
				element: receiver,
			});

			return () => {
				element.current = null;
				disconnect();
			};
		},
		[circuit, wirePath, label],
	);

	// After the new data-g-edge attribute is in the DOM (so the CSS for it applies), but before the
	// browser paints and before the circuit's next frame, when an edge with no holds would settle.
	useLayoutEffect(() => {
		// Only an edge in motion needs holding, and only once there's an element to measure.
		if (edge !== 'rising' && edge !== 'falling') return;
		if (element.current === null) return;

		// The cleanup ends the hold: the edge changed again, or the element is unmounting.
		return holdWhileMoving(element.current, () => circuit.holdEdge(wirePath));
	}, [circuit, wirePath, edge]);

	return {
		ref,
		'data-g-power': powered ? 'on' : 'off',
		'data-g-edge': edge,
		...(signal !== null && { 'data-g-signal': signal }),
		...(options.inert && !powered && { inert: true }),
	};
}

export interface GReceiverProps extends Omit<ComponentProps<'div'>, 'inert'>, ReceiverOptions {
	readonly wire: string;
	/** Give the receiver's props to the single child element, instead of rendering a `div`. */
	readonly asChild?: boolean;
}

/** A receiver as a component: a `div`, or with `asChild`, its child element. */
export function GReceiver({ wire, inert, label, asChild, ...props }: GReceiverProps): ReactNode {
	const receiver = useReceiver(wire, {
		...(inert !== undefined && { inert }),
		...(label !== undefined && { label }),
	});
	return asChild ? <Slot {...props} {...receiver} /> : <div {...props} {...receiver} />;
}
