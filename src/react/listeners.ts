import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { parseTrigger, type TriggerEntry } from '../core/index.js';
import { useBoard } from './context.js';
import type { Media } from './media.js';

/** What a trigger's events do. Parts supply these. */
export interface TriggerHandlers {
	/** A single-event entry fired: do the part's latching action. */
	readonly latch?: (event: Event) => void;
	/** A pulse entry fired: `true` for its on-event, `false` for its off-event. */
	readonly pulse?: (on: boolean, event: Event) => void;
}

/** Disabled inputs don't respond, whether disabled natively or with `aria-disabled`. */
function disabled(element: Element): boolean {
	return element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true';
}

/**
 * Listen for a trigger's events on an element. Each entry's breakpoint scope is checked when its
 * event fires, so nothing needs re-attaching when the viewport resizes. Returns a function that
 * removes every listener.
 */
export function attachTrigger(
	element: Element,
	entries: readonly TriggerEntry[],
	media: Media,
	handlers: TriggerHandlers,
): () => void {
	const listeners: [string, (event: Event) => void][] = [];
	for (const { scope, action } of entries) {
		media.query(scope); // Fail now, not on the first event, if a breakpoint is unknown.
		const listen = (type: string, handle: (event: Event) => void) => {
			listeners.push([
				type,
				(event) => {
					if (media.matches(scope) && !disabled(element)) handle(event);
				},
			]);
		};
		if (action.kind === 'latch') {
			listen(action.event, (event) => handlers.latch?.(event));
		} else {
			listen(action.on, (event) => handlers.pulse?.(true, event));
			listen(action.off, (event) => handlers.pulse?.(false, event));
		}
	}
	for (const [type, listener] of listeners) element.addEventListener(type, listener);
	return () => {
		for (const [type, listener] of listeners) element.removeEventListener(type, listener);
	};
}

/**
 * A ref callback that attaches a trigger string's listeners to the element it's given, and
 * removes them when React detaches it. It stays the same function while the trigger is the same,
 * even when `handlers` is a new object every render: listeners always call the latest handlers.
 */
export function useTrigger(
	trigger: string,
	handlers: TriggerHandlers,
): (element: Element | null) => (() => void) | undefined {
	const { media } = useBoard();
	const entries = useMemo(() => parseTrigger(trigger), [trigger]);
	const latest = useRef(handlers);
	useLayoutEffect(() => {
		latest.current = handlers;
	});
	return useCallback(
		(element: Element | null) => {
			if (element === null) return undefined;
			return attachTrigger(element, entries, media, {
				latch: (event) => latest.current.latch?.(event),
				pulse: (on, event) => latest.current.pulse?.(on, event),
			});
		},
		[entries, media],
	);
}
