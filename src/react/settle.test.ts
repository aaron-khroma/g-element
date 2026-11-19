import { holdWhileMoving, longestMotion, SETTLE_GRACE_MS } from './settle.js';

/** A computed style with only the given properties set. */
function style(values: Record<string, string>): CSSStyleDeclaration {
	return { getPropertyValue: (name: string) => values[name] ?? '' } as CSSStyleDeclaration;
}

function stubStyle(values: Record<string, string>) {
	vi.spyOn(window, 'getComputedStyle').mockReturnValue(style(values));
}

function fire(target: Element, type: string, detail: Record<string, string>) {
	target.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), detail));
}

describe('longestMotion', () => {
	it('finds nothing when nothing moves', () => {
		expect(longestMotion(style({}))).toBeNull();
		expect(
			longestMotion(
				style({
					'transition-property': 'all',
					'transition-duration': '0s',
					'transition-delay': '0s',
				}),
			),
		).toBeNull();
	});

	it('adds delay to duration, reading seconds and milliseconds', () => {
		expect(
			longestMotion(
				style({
					'transition-property': 'opacity',
					'transition-duration': '0.3s',
					'transition-delay': '50ms',
				}),
			),
		).toEqual({ kind: 'transition', name: 'opacity', ms: 350 });
	});

	it('repeats shorter lists to match the property list, as CSS does', () => {
		expect(
			longestMotion(
				style({
					'transition-property': 'opacity, transform, color',
					'transition-duration': '100ms, 400ms',
					'transition-delay': '0s',
				}),
			),
		).toEqual({ kind: 'transition', name: 'transform', ms: 400 });
	});

	it('lets any property end an `all` transition', () => {
		expect(
			longestMotion(style({ 'transition-property': 'all', 'transition-duration': '200ms' })),
		).toEqual({ kind: 'transition', name: null, ms: 200 });
	});

	it('counts animation iterations, and skips animations that never end', () => {
		expect(
			longestMotion(
				style({
					'transition-property': 'opacity',
					'transition-duration': '300ms',
					'animation-name': 'spin, pulse',
					'animation-duration': '200ms, 1s',
					'animation-iteration-count': '2, infinite',
				}),
			),
		).toEqual({ kind: 'animation', name: 'spin', ms: 400 });
	});
});

describe('holdWhileMoving', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	function setup(values: Record<string, string>) {
		stubStyle(values);
		const element = document.createElement('div');
		const child = document.createElement('span');
		element.append(child);
		const done = vi.fn();
		const hold = vi.fn(() => done);
		const cancel = holdWhileMoving(element, hold);
		return { element, child, done, hold, cancel };
	}

	const fade = { 'transition-property': 'opacity', 'transition-duration': '300ms' };

	it('takes no hold when nothing moves', () => {
		const { hold } = setup({});
		expect(hold).not.toHaveBeenCalled();
	});

	it('lets go when its own longest transition ends', () => {
		const { element, hold, done } = setup(fade);
		expect(hold).toHaveBeenCalledTimes(1);
		fire(element, 'transitionend', { propertyName: 'color' });
		expect(done).not.toHaveBeenCalled();
		fire(element, 'transitionend', { propertyName: 'opacity' });
		expect(done).toHaveBeenCalledTimes(1);
	});

	it('ignores transitions that end on descendants and bubble up', () => {
		const { child, done } = setup(fade);
		fire(child, 'transitionend', { propertyName: 'opacity' });
		expect(done).not.toHaveBeenCalled();
	});

	it('waits on animations by name', () => {
		const { element, done } = setup({ 'animation-name': 'drop', 'animation-duration': '1s' });
		fire(element, 'animationend', { animationName: 'drop' });
		expect(done).toHaveBeenCalledTimes(1);
	});

	it('lets go after the computed time plus a grace period when no end event comes', () => {
		const { done } = setup(fade);
		vi.advanceTimersByTime(300 + SETTLE_GRACE_MS - 1);
		expect(done).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(done).toHaveBeenCalledTimes(1);
	});

	it('lets go once when cancelled, and stops listening', () => {
		const { element, done, cancel } = setup(fade);
		cancel();
		cancel();
		fire(element, 'transitionend', { propertyName: 'opacity' });
		vi.runAllTimers();
		expect(done).toHaveBeenCalledTimes(1);
	});
});
