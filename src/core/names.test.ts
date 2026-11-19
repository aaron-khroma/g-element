import { resolveWirePath } from './names.js';

describe('resolveWirePath', () => {
	it('uses a plain name as the path outside any device', () => {
		expect(resolveWirePath('menu')).toBe('menu');
	});

	it('bundles a plain name into its device', () => {
		expect(resolveWirePath('gallery', 'case-study')).toBe('case-study/gallery');
	});

	it('nests devices', () => {
		const device = resolveWirePath('gallery', 'case-study');
		expect(resolveWirePath('slide', device)).toBe('case-study/gallery/slide');
	});

	it('reads a leading slash as the app root, inside any device', () => {
		expect(resolveWirePath('/theme', 'case-study/gallery')).toBe('theme');
		expect(resolveWirePath('/case-study/gallery')).toBe('case-study/gallery');
	});

	it.each(['', '/', 'menu/', 'a//b', '//theme'])(
		'rejects %j, which has an empty part',
		(wireName) => {
			expect(() => resolveWirePath(wireName, 'device')).toThrow(/empty part/);
		},
	);
});
