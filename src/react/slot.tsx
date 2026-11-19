import {
	cloneElement,
	isValidElement,
	useCallback,
	type CSSProperties,
	type ReactNode,
	type Ref,
	type RefCallback,
} from 'react';

type AnyProps = Record<string, unknown>;

export interface SlotProps extends AnyProps {
	readonly children?: ReactNode;
	readonly ref?: Ref<unknown>;
}

/**
 * Pass props to the single child element instead of rendering an element of its own. This is how
 * `asChild` works: `<GReceiver asChild><nav /></GReceiver>` renders the `nav` with the receiver's props.
 *
 * The child's own props win, except that event handlers both run (the child's first), class names
 * join, styles merge, and refs both receive the element.
 */
export function Slot({ children, ref: slotRef, ...props }: SlotProps): ReactNode {
	if (!isValidElement<AnyProps>(children)) {
		throw new Error('asChild needs a single element child, such as <button> or <nav>.');
	}
	const { ref: childRef, ...childProps } = children.props as AnyProps & { ref?: Ref<unknown> };
	const merged = mergeProps(props, childProps);
	// The same function while both refs stay the same, so React doesn't detach and reattach it on
	// every render. The compiler's lint can't tell that the refs are only touched when React
	// attaches the element, not while rendering, so it reports them here.
	/* eslint-disable react-hooks/refs */
	const ref = useCallback(
		(element: unknown) => mergeRefs(slotRef, childRef)(element),
		[slotRef, childRef],
	);
	return cloneElement(children, { ...merged, ref });
	/* eslint-enable react-hooks/refs */
}

function mergeProps(slot: AnyProps, child: AnyProps): AnyProps {
	const merged: AnyProps = { ...slot, ...child };
	for (const key of Object.keys(slot)) {
		const ours = slot[key];
		const theirs = child[key];
		if (/^on[A-Z]/.test(key) && typeof ours === 'function' && typeof theirs === 'function') {
			merged[key] = (...args: unknown[]) => {
				theirs(...args);
				ours(...args);
			};
		} else if (key === 'className' && ours && theirs) {
			merged[key] = `${String(ours)} ${String(theirs)}`;
		} else if (key === 'style' && ours && theirs) {
			merged[key] = { ...(ours as CSSProperties), ...(theirs as CSSProperties) };
		}
	}
	return merged;
}

/**
 * One ref callback that feeds the element to every given ref, object or callback. A callback's
 * cleanup function (React 19) runs when the merged ref is cleaned up.
 */
export function mergeRefs<T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> {
	return (element) => {
		const cleanups = refs.map((ref) => {
			if (typeof ref === 'function') {
				const cleanup = ref(element);
				return typeof cleanup === 'function' ? cleanup : () => ref(null);
			}
			if (ref) {
				ref.current = element;
				return () => {
					ref.current = null;
				};
			}
			return () => {};
		});
		return () => {
			for (const cleanup of cleanups) cleanup();
		};
	};
}
