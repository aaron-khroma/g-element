/**
 * A component names a wire relative to the device it's in. The circuit stores each wire under its
 * path, which bundles the wire into every device around it:
 *
 * - `resolveWirePath('gallery', 'case-study')` is `'case-study/gallery'`, a bundled wire
 * - `resolveWirePath('/theme', 'case-study')` is `'theme'`: a leading `/` names a wire from the root
 * - `resolveWirePath('menu')` is `'menu'`: outside any device, the name is the path
 *
 * A device's own name resolves the same way against its parent device, so nested devices nest paths.
 */
export function resolveWirePath(wireName: string, devicePath = ''): string {
	const absolute = wireName.startsWith('/');
	const path = absolute ? wireName.slice(1) : wireName;
	if (path.split('/').includes('')) {
		throw new Error(
			`Wire name "${wireName}" has an empty part. Use names like "menu" or "/theme".`,
		);
	}
	return absolute || devicePath === '' ? path : `${devicePath}/${path}`;
}
