import { resolveWire } from './names.js';

describe('resolveWire', () => {
	it('keeps a plain name as is outside any scope', () => {
		expect(resolveWire('menu')).toBe('menu');
	});

	it('makes a plain name local to its scope', () => {
		expect(resolveWire('gallery', 'case-study')).toBe('case-study/gallery');
	});

	it('nests scopes', () => {
		const scope = resolveWire('gallery', 'case-study');
		expect(resolveWire('slide', scope)).toBe('case-study/gallery/slide');
	});

	it('reads a leading slash as the app root, inside any scope', () => {
		expect(resolveWire('/theme', 'case-study/gallery')).toBe('theme');
		expect(resolveWire('/case-study/gallery')).toBe('case-study/gallery');
	});

	it.each(['', '/', 'menu/', 'a//b', '//theme'])('rejects %j, which has an empty part', (name) => {
		expect(() => resolveWire(name, 'scope')).toThrow(/empty part/);
	});
});
