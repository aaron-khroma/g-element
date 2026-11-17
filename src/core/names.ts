/**
 * Wire names are paths. Inside a scope, a plain name is local to it, and a leading `/` names a wire
 * from the app's root:
 *
 * - `resolveWire('gallery', 'case-study')` is `'case-study/gallery'`
 * - `resolveWire('/theme', 'case-study')` is `'theme'`
 *
 * A scope's own name resolves the same way against its parent scope, so nested scopes nest paths.
 */
export function resolveWire(name: string, scope = ''): string {
	const absolute = name.startsWith('/');
	const path = absolute ? name.slice(1) : name;
	if (path.split('/').includes('')) {
		throw new Error(`Wire name "${name}" has an empty part. Use names like "menu" or "/theme".`);
	}
	return absolute || scope === '' ? path : `${scope}/${path}`;
}
