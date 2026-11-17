import { parseScope } from './scope.js';

describe('parseScope', () => {
	it('applies an empty scope at every width', () => {
		expect(parseScope('')).toBeNull();
	});

	it('reads a breakpoint as "this wide and wider"', () => {
		expect(parseScope('md')).toBe('(width >= 48rem)');
	});

	it('reads max- as "narrower than"', () => {
		expect(parseScope('max-md')).toBe('(width < 48rem)');
	});

	it('requires every stacked prefix to match', () => {
		expect(parseScope('md:max-lg')).toBe('(width >= 48rem) and (width < 64rem)');
	});

	it('uses custom breakpoints when given', () => {
		expect(parseScope('tablet', { tablet: '600px' })).toBe('(width >= 600px)');
	});

	it.each(['mid', 'max-', 'md:', 'md::lg'])('rejects the unknown breakpoint in %j', (scope) => {
		expect(() => parseScope(scope)).toThrow(/Unknown breakpoint/);
	});
});
