import { parseTrigger } from './trigger.js';

describe('parseTrigger', () => {
	it('reads one event as a latching action', () => {
		expect(parseTrigger('click')).toEqual([
			{ scope: '', action: { kind: 'latch', event: 'click' } },
		]);
	});

	it('reads an off|on pair as a pulse', () => {
		expect(parseTrigger('mouseleave|mouseenter')).toEqual([
			{ scope: '', action: { kind: 'pulse', off: 'mouseleave', on: 'mouseenter' } },
		]);
	});

	it('keeps each entry and its breakpoint scope separate', () => {
		expect(parseTrigger('max-md:click md:max-lg:focusout|focusin')).toEqual([
			{ scope: 'max-md', action: { kind: 'latch', event: 'click' } },
			{ scope: 'md:max-lg', action: { kind: 'pulse', off: 'focusout', on: 'focusin' } },
		]);
	});

	it('accepts custom event names and extra whitespace', () => {
		expect(parseTrigger('  md:menu.open|menu-close \n click  ')).toHaveLength(2);
	});

	it('reads an empty trigger as no entries', () => {
		expect(parseTrigger('   ')).toEqual([]);
	});

	it('freezes what it returns', () => {
		const [entry] = parseTrigger('click');
		expect(Object.isFrozen(entry)).toBe(true);
		expect(Object.isFrozen(entry?.action)).toBe(true);
	});

	it.each([
		['md:', "isn't an event name"],
		[':click', "isn't a breakpoint prefix"],
		['a|b|c', 'more than two events'],
		['click|click', 'same event for off and on'],
		['|mouseenter', "isn't an event name"],
		['md:click!', "isn't an event name"],
	])('rejects %j', (trigger, reason) => {
		expect(() => parseTrigger(trigger)).toThrow(reason);
	});
});
