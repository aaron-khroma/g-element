import { act, fireEvent, render } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import type { Circuit } from '../core/index.js';
import { GCircuit } from './GCircuit.js';
import { useCircuit } from './hooks.js';
import { GReceiver, useReceiver, type ReceiverOptions } from './receiver.js';
import { SETTLE_GRACE_MS } from './settle.js';

let circuit: Circuit;
const keep = (found: Circuit) => {
	circuit = found;
};
/** Hands the test the circuit, once mounted. */
function Grab() {
	const found = useCircuit();
	useLayoutEffect(() => keep(found), [found]);
	return null;
}

function Panel({ wire = 'menu', ...options }: ReceiverOptions & { wire?: string }) {
	return <nav {...useReceiver(wire, options)} />;
}

function renderPanel(props: ReceiverOptions = {}, wires = {}) {
	const result = render(
		<GCircuit wires={wires}>
			<Grab />
			<Panel {...props} />
		</GCircuit>,
	);
	const nav = result.container.querySelector('nav');
	if (!nav) throw new Error('no nav');
	return { ...result, nav };
}

function attributes(element: Element) {
	return Object.fromEntries(
		element.getAttributeNames().map((name) => [name, element.getAttribute(name)]),
	);
}

/** Give every element the same computed transition. */
function stubTransition(duration: string) {
	vi.spyOn(window, 'getComputedStyle').mockReturnValue({
		getPropertyValue: (name: string) =>
			({ 'transition-property': 'opacity', 'transition-duration': duration })[name] ?? '',
	} as CSSStyleDeclaration);
}

describe('useReceiver', () => {
	beforeEach(() => {
		vi.useFakeTimers({
			toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
		});
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	const frame = () => act(() => vi.advanceTimersByTime(16));

	it('shows the wire’s state in data-g-* attributes', () => {
		const { nav } = renderPanel({}, { menu: { powered: true, signal: 'about' } });
		expect(attributes(nav)).toEqual({
			'data-g-power': 'on',
			'data-g-edge': 'on',
			'data-g-signal': 'about',
		});
		act(() => circuit.power('menu', false));
		expect(attributes(nav)).toEqual({
			'data-g-power': 'off',
			'data-g-edge': 'falling',
			'data-g-signal': 'about',
		});
		act(() => circuit.setSignal('menu', null));
		expect(nav.hasAttribute('data-g-signal')).toBe(false);
	});

	it('is inert while the wire is off, when asked', () => {
		const { nav } = renderPanel({ inert: true });
		expect(nav.hasAttribute('inert')).toBe(true);
		act(() => circuit.power('menu', true));
		expect(nav.hasAttribute('inert')).toBe(false);
	});

	it('connects to the wire while mounted', () => {
		const { nav, unmount } = renderPanel({ label: 'Menu panel' });
		expect(circuit.connections('menu')).toEqual([
			{ kind: 'receiver', label: 'Menu panel', element: nav },
		]);
		unmount();
		expect(circuit.connections('menu')).toEqual([]);
	});

	it('lets an edge settle on the next frame when nothing moves', () => {
		const { nav } = renderPanel();
		act(() => circuit.power('menu', true));
		expect(nav.dataset['gEdge']).toBe('rising');
		frame();
		expect(nav.dataset['gEdge']).toBe('on');
	});

	it('holds the edge until its transition ends', () => {
		stubTransition('300ms');
		const { nav } = renderPanel();
		act(() => circuit.power('menu', true));
		frame();
		expect(nav.dataset['gEdge']).toBe('rising');
		act(() => {
			fireEvent(nav, Object.assign(new Event('transitionend'), { propertyName: 'opacity' }));
		});
		expect(nav.dataset['gEdge']).toBe('on');
	});

	it('settles anyway once the transition’s time has passed', () => {
		stubTransition('300ms');
		const { nav } = renderPanel();
		act(() => circuit.power('menu', true));
		act(() => vi.advanceTimersByTime(300 + SETTLE_GRACE_MS - 1));
		expect(nav.dataset['gEdge']).toBe('rising');
		act(() => vi.advanceTimersByTime(1));
		expect(nav.dataset['gEdge']).toBe('on');
	});

	it('stops holding the edge when it unmounts', () => {
		stubTransition('300ms');
		const { unmount } = renderPanel();
		act(() => circuit.power('menu', true));
		unmount();
		frame();
		expect(circuit.measure('menu').edge).toBe('on');
	});
});

describe('GReceiver', () => {
	it('renders a div, or with asChild, its child', () => {
		const { container } = render(
			<GCircuit wires={{ menu: { powered: true } }}>
				<GReceiver wire="menu" className="panel" />
				<GReceiver wire="menu" asChild>
					<aside />
				</GReceiver>
			</GCircuit>,
		);
		expect(container.querySelector('div.panel')?.getAttribute('data-g-power')).toBe('on');
		expect(container.querySelector('aside')?.getAttribute('data-g-power')).toBe('on');
	});
});
