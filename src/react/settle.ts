/** The longest-running transition or animation on an element. */
export interface Motion {
	readonly kind: 'transition' | 'animation';
	/** The transition's property or the animation's name, or `null` when any one may end it (`all`). */
	readonly name: string | null;
	/** Delay plus running time, in milliseconds. */
	readonly ms: number;
}

/** How long past its computed end a motion may run before the edge settles anyway. */
export const SETTLE_GRACE_MS = 50;

/** `'0.3s, 150ms'` → `[300, 150]`. */
function times(list: string): number[] {
	return list.split(',').map((time) => {
		const value = parseFloat(time);
		if (Number.isNaN(value)) return 0;
		return time.trim().endsWith('ms') ? value : value * 1000;
	});
}

function names(list: string): string[] {
	return list.split(',').map((name) => name.trim());
}

/** CSS repeats a shorter list to match the longest one, as `transition-delay: 0s` does. */
function cycle<T>(list: readonly T[], index: number, fallback: T): T {
	return list.length === 0 ? fallback : (list[index % list.length] ?? fallback);
}

/**
 * Find the motion that will finish last, from computed styles. Returns `null` when nothing moves:
 * no transitions or animations, all of zero length (`motion-reduce:transition-none`), or only
 * animations that never end.
 */
export function longestMotion(style: CSSStyleDeclaration): Motion | null {
	let longest: Motion | null = null;
	const consider = (motion: Motion) => {
		if (motion.ms > 0 && (longest === null || motion.ms > longest.ms)) longest = motion;
	};

	const properties = names(style.getPropertyValue('transition-property'));
	const durations = times(style.getPropertyValue('transition-duration'));
	const delays = times(style.getPropertyValue('transition-delay'));
	properties.forEach((property, index) => {
		if (property === '' || property === 'none') return;
		consider({
			kind: 'transition',
			name: property === 'all' ? null : property,
			ms: cycle(durations, index, 0) + cycle(delays, index, 0),
		});
	});

	const animations = names(style.getPropertyValue('animation-name'));
	const animationDurations = times(style.getPropertyValue('animation-duration'));
	const animationDelays = times(style.getPropertyValue('animation-delay'));
	const counts = names(style.getPropertyValue('animation-iteration-count'));
	animations.forEach((animation, index) => {
		if (animation === '' || animation === 'none') return;
		const count = cycle(counts, index, '1');
		if (count === 'infinite') return;
		const iterations = parseFloat(count);
		consider({
			kind: 'animation',
			name: animation,
			ms:
				cycle(animationDelays, index, 0) +
				cycle(animationDurations, index, 0) * (Number.isNaN(iterations) ? 1 : iterations),
		});
	});

	return longest;
}

/**
 * Hold a wire's edge for as long as the element's longest transition or animation runs. Call it
 * after the element's styles reflect the new edge. If nothing moves, it doesn't hold at all.
 *
 * The hold ends at the first of: the longest motion's own end event (not one bubbling up from a
 * descendant), or a timer at its computed length plus a little grace, for motions that never
 * report an end. Returns a function that ends it early, as when the element unmounts.
 */
export function holdWhileMoving(element: Element, hold: () => () => void): () => void {
	const motion = longestMotion(getComputedStyle(element));
	if (motion === null) return () => {};

	const done = hold();
	const type = motion.kind === 'transition' ? 'transitionend' : 'animationend';
	let finished = false;

	function finish(): void {
		if (finished) return;
		finished = true;
		element.removeEventListener(type, onEnd);
		clearTimeout(timer);
		done();
	}

	const { kind, name } = motion;
	function onEnd(event: Event): void {
		if (event.target !== element) return;
		const ended =
			kind === 'transition'
				? (event as TransitionEvent).propertyName
				: (event as AnimationEvent).animationName;
		if (name === null || ended === name) finish();
	}

	element.addEventListener(type, onEnd);
	const timer = setTimeout(finish, motion.ms + SETTLE_GRACE_MS);
	return finish;
}
