import { DEFAULT_BREAKPOINTS, parseScope, type Breakpoints } from '../core/index.js';

/** Breakpoint scopes, answered by the browser's media queries. */
export interface Media {
	/** The media query for a scope, or `null` for the empty scope. Throws on unknown breakpoints. */
	query(scope: string): string | null;
	/**
	 * Whether a scope applies right now. The empty scope always does. Where there are no media
	 * queries (prerendering), a scoped one never does.
	 */
	matches(scope: string): boolean;
	/** Call `listener` whenever the scope starts or stops applying. Returns a function that stops. */
	subscribe(scope: string, listener: () => void): () => void;
}

/**
 * The breakpoints to use: Tailwind's defaults, then any `--breakpoint-*` variables the page's CSS
 * defines on `:root`, then `overrides`. Without a document (prerendering), only defaults and
 * overrides apply.
 */
export function resolveBreakpoints(overrides: Breakpoints = {}): Breakpoints {
	const fromCss: Record<string, string> = {};
	if (typeof document !== 'undefined' && typeof getComputedStyle === 'function') {
		const style = getComputedStyle(document.documentElement);
		for (const name of Object.keys(DEFAULT_BREAKPOINTS)) {
			const value = style.getPropertyValue(`--breakpoint-${name}`).trim();
			if (value !== '') fromCss[name] = value;
		}
	}
	return Object.freeze({ ...DEFAULT_BREAKPOINTS, ...fromCss, ...overrides });
}

export function createMedia(breakpoints: Breakpoints): Media {
	const lists = new Map<string, MediaQueryList>();

	function list(scope: string): MediaQueryList | null {
		const query = parseScope(scope, breakpoints);
		if (query === null || typeof matchMedia !== 'function') return null;
		let found = lists.get(query);
		if (!found) {
			found = matchMedia(query);
			lists.set(query, found);
		}
		return found;
	}

	return {
		query: (scope) => parseScope(scope, breakpoints),
		matches: (scope) => scope === '' || (list(scope)?.matches ?? false),
		subscribe(scope, listener) {
			const found = list(scope);
			if (!found) return () => {};
			found.addEventListener('change', listener);
			return () => found.removeEventListener('change', listener);
		},
	};
}
