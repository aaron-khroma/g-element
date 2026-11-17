/** Breakpoint name → minimum width, as CSS lengths. */
export type Breakpoints = Readonly<Record<string, string>>;

/** Tailwind's defaults. */
export const DEFAULT_BREAKPOINTS: Breakpoints = Object.freeze({
	sm: '40rem',
	md: '48rem',
	lg: '64rem',
	xl: '80rem',
	'2xl': '96rem',
});

/**
 * Turn a breakpoint scope into a media query, with Tailwind's meaning: `md` is "md and wider",
 * `max-md` is "narrower than md", and stacked prefixes must all match.
 *
 * `parseScope('md:max-lg')` is `'(width >= 48rem) and (width < 64rem)'`. An empty scope applies at
 * every width, and returns `null`.
 */
export function parseScope(
	scope: string,
	breakpoints: Breakpoints = DEFAULT_BREAKPOINTS,
): string | null {
	if (scope === '') return null;
	return scope
		.split(':')
		.map((prefix) => {
			const max = prefix.startsWith('max-');
			const name = max ? prefix.slice(4) : prefix;
			const width = breakpoints[name];
			if (width === undefined) {
				const known = Object.keys(breakpoints).join(', ');
				throw new Error(`Unknown breakpoint "${prefix}" in scope "${scope}". Known: ${known}.`);
			}
			return max ? `(width < ${width})` : `(width >= ${width})`;
		})
		.join(' and ');
}
