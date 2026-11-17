/**
 * What an input's events do. One event latches: it does the part's action, such as toggling. An
 * `off|on` pair pulses the wire: the on-event drives it and the off-event releases it.
 */
export type TriggerAction =
	| { readonly kind: 'latch'; readonly event: string }
	| { readonly kind: 'pulse'; readonly off: string; readonly on: string };

export interface TriggerEntry {
	/** The breakpoint scope the entry applies in (`'max-md'`, `'md:max-lg'`), or `''` for every width. */
	readonly scope: string;
	readonly action: TriggerAction;
}

const EVENT = /^[A-Za-z][\w.-]*$/;
const PREFIX = /^(max-)?[A-Za-z0-9]+$/;

/**
 * Parse a trigger string. Space-separated entries are independent, and each may be scoped by
 * breakpoint prefixes:
 *
 * ```
 * trigger := entry (' ' entry)*
 * entry   := (prefix ':')* action
 * action  := event | event '|' event
 * ```
 *
 * `'max-md:click md:mouseleave|mouseenter'` latches on click below md, and pulses on hover from md
 * up. Breakpoint names are checked when the scope is turned into a media query.
 */
export function parseTrigger(trigger: string): TriggerEntry[] {
	const text = trigger.trim();
	if (text === '') return [];
	return text.split(/\s+/).map((entry) => {
		const parts = entry.split(':');
		const actionText = parts.pop() ?? '';
		for (const prefix of parts) {
			if (!PREFIX.test(prefix)) fail(trigger, `"${prefix}" isn't a breakpoint prefix`);
		}
		const events = actionText.split('|');
		for (const event of events) {
			if (!EVENT.test(event)) fail(trigger, `"${event}" isn't an event name`);
		}
		const [first, second] = events;
		let action: TriggerAction;
		if (events.length === 1 && first !== undefined) {
			action = { kind: 'latch', event: first };
		} else if (events.length === 2 && first !== undefined && second !== undefined) {
			if (first === second) fail(trigger, `"${actionText}" uses the same event for off and on`);
			action = { kind: 'pulse', off: first, on: second };
		} else {
			fail(trigger, `"${actionText}" has more than two events`);
		}
		return Object.freeze({ scope: parts.join(':'), action: Object.freeze(action) });
	});
}

function fail(trigger: string, reason: string): never {
	throw new Error(`Invalid trigger "${trigger}": ${reason}.`);
}
