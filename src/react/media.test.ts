import { createMedia, resolveBreakpoints } from './media.js';
import { DEFAULT_BREAKPOINTS } from '../core/index.js';

/** A stand-in for `matchMedia`, whose lists match whatever `matching` holds. */
function fakeMatchMedia(matching: Set<string>) {
	const lists: (MediaQueryList & { emit(): void })[] = [];
	const matchMedia = vi.fn((query: string) => {
		const target = new EventTarget();
		// defineProperties keeps `matches` a live getter; Object.assign would copy its value once.
		const list = Object.defineProperties(target, {
			media: { value: query },
			matches: { get: () => matching.has(query) },
			emit: { value: () => target.dispatchEvent(new Event('change')) },
		}) as unknown as MediaQueryList & { emit(): void };
		lists.push(list);
		return list;
	});
	vi.stubGlobal('matchMedia', matchMedia);
	return { matchMedia, lists };
}

afterEach(() => {
	vi.unstubAllGlobals();
	document.documentElement.removeAttribute('style');
});

describe('media', () => {
	it('always matches the empty scope, and asks the browser about the others', () => {
		const matching = new Set(['(width >= 48rem)']);
		fakeMatchMedia(matching);
		const media = createMedia(DEFAULT_BREAKPOINTS);
		expect(media.matches('')).toBe(true);
		expect(media.matches('md')).toBe(true);
		expect(media.matches('max-md')).toBe(false);
		matching.clear();
		expect(media.matches('md')).toBe(false);
	});

	it('makes one media query list per query', () => {
		const { matchMedia } = fakeMatchMedia(new Set());
		const media = createMedia(DEFAULT_BREAKPOINTS);
		media.matches('md');
		media.matches('md');
		media.subscribe('md', () => {});
		expect(matchMedia).toHaveBeenCalledTimes(1);
	});

	it('tells subscribers when a scope starts or stops applying, until they stop', () => {
		const { lists } = fakeMatchMedia(new Set());
		const media = createMedia(DEFAULT_BREAKPOINTS);
		const listener = vi.fn();
		const stop = media.subscribe('md', listener);
		lists[0]?.emit();
		stop();
		lists[0]?.emit();
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('matches no scoped query where there are no media queries', () => {
		vi.stubGlobal('matchMedia', undefined);
		const media = createMedia(DEFAULT_BREAKPOINTS);
		expect(media.matches('md')).toBe(false);
		expect(media.matches('')).toBe(true);
	});

	it('throws on unknown breakpoints', () => {
		expect(() => createMedia(DEFAULT_BREAKPOINTS).query('tablet')).toThrow(/Unknown breakpoint/);
	});
});

describe('resolveBreakpoints', () => {
	it('layers the page’s --breakpoint-* variables over the defaults, and overrides over both', () => {
		document.documentElement.style.setProperty('--breakpoint-md', '50rem');
		document.documentElement.style.setProperty('--breakpoint-lg', '70rem');
		expect(resolveBreakpoints({ lg: '72rem', tablet: '45rem' })).toEqual({
			...DEFAULT_BREAKPOINTS,
			md: '50rem',
			lg: '72rem',
			tablet: '45rem',
		});
	});
});
