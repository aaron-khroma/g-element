import { act, render, renderHook } from '@testing-library/react';
import { StrictMode, useLayoutEffect, type ReactNode } from 'react';
import type { Circuit } from '../core/index.js';
import { GCircuit, type GCircuitProps } from './GCircuit.js';
import { GDevice } from './GDevice.js';
import { useCircuit, useEdge, usePower, useSignal, useWire } from './hooks.js';

function withCircuit(props: GCircuitProps = {}) {
	return ({ children }: { children: ReactNode }) => <GCircuit {...props}>{children}</GCircuit>;
}

/** Render a hook with the circuit beside it, so the test can change wires. */
function renderReader<T>(read: () => T, props: GCircuitProps = {}) {
	const result = renderHook(() => ({ value: read(), circuit: useCircuit() }), {
		wrapper: withCircuit(props),
	});
	const circuit: Circuit = result.result.current.circuit;
	return { ...result, circuit, value: () => result.result.current.value };
}

describe('GCircuit', () => {
	it('gives every component in its tree the same circuit', () => {
		const found: Circuit[] = [];
		function Grab() {
			const circuit = useCircuit();
			useLayoutEffect(() => {
				found.push(circuit);
			}, [circuit]);
			return null;
		}
		render(
			<GCircuit>
				<Grab />
				<div>
					<Grab />
				</div>
			</GCircuit>,
		);
		expect(found).toHaveLength(2);
		expect(found[0]).toBe(found[1]);
	});

	it('gives each GCircuit its own circuit, starting from its wires', () => {
		const first = renderHook(() => useCircuit(), {
			wrapper: withCircuit({ wires: { menu: { powered: true } } }),
		}).result.current;
		const second = renderHook(() => useCircuit(), { wrapper: withCircuit() }).result.current;
		expect(first).not.toBe(second);
		expect(first.measure('menu').powered).toBe(true);
		expect(second.measure('menu').powered).toBe(false);
	});

	it('keeps one circuit for its whole life, ignoring new starting states', () => {
		let wires = { menu: { powered: true } };
		const { result, rerender } = renderHook(() => useCircuit(), {
			wrapper: ({ children }) => <GCircuit wires={wires}>{children}</GCircuit>,
		});
		const first = result.current;
		wires = { menu: { powered: false } };
		rerender();
		expect(result.current).toBe(first);
		expect(first.measure('menu').powered).toBe(true);
	});
});

describe('reader hooks', () => {
	it('throw outside a GCircuit', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(() => renderHook(() => usePower('menu'))).toThrow(/inside a <GCircuit>/);
		vi.restoreAllMocks();
	});

	it('read the starting state from the first render', () => {
		const { value } = renderReader(() => [usePower('menu'), useSignal('theme')], {
			wires: { menu: { powered: true }, theme: { signal: 'auto' } },
		});
		expect(value()).toEqual([true, 'auto']);
	});

	it('re-render when the wire changes', () => {
		const { value, circuit } = renderReader(() => usePower('menu'));
		expect(value()).toBe(false);
		act(() => circuit.power('menu', true));
		expect(value()).toBe(true);
	});

	it('re-render only when the value they read changes', () => {
		let renders = 0;
		const { circuit } = renderReader(() => {
			renders++;
			return usePower('menu');
		});
		const before = renders;
		act(() => circuit.setSignal('menu', 'about'));
		expect(renders).toBe(before);
		act(() => circuit.power('menu', true));
		expect(renders).toBe(before + 1);
	});

	it('read edges and whole measurements', () => {
		const { value, circuit } = renderReader(() => [useEdge('menu'), useWire('menu')] as const);
		act(() => circuit.power('menu', true));
		const [edge, measurement] = value();
		expect(edge).toBe('rising');
		expect(measurement).toBe(circuit.measure('menu'));
	});
});

describe('GDevice', () => {
	function Show({ wire }: { wire: string }) {
		return <span data-wire={wire}>{String(usePower(wire))}</span>;
	}

	function shown(container: HTMLElement): Record<string, string | null> {
		return Object.fromEntries(
			[...container.querySelectorAll('[data-wire]')].map((element) => [
				element.getAttribute('data-wire'),
				element.textContent,
			]),
		);
	}

	it('bundles wire names into the device, with "/" reaching the root', () => {
		let circuit: Circuit | undefined;
		function Grab() {
			circuit = useCircuit();
			return null;
		}
		const { container } = render(
			<GCircuit>
				<Grab />
				<GDevice name="case-study">
					<Show wire="gallery" />
					<Show wire="/theme" />
				</GDevice>
			</GCircuit>,
		);
		act(() => {
			circuit?.power('case-study/gallery', true);
		});
		expect(shown(container)).toEqual({ gallery: 'true', '/theme': 'false' });
	});

	it('installs its starting states before its children first render', () => {
		const { container } = render(
			<GCircuit>
				<GDevice name="case-study" wires={{ gallery: { powered: true } }}>
					<Show wire="gallery" />
				</GDevice>
			</GCircuit>,
		);
		expect(shown(container)).toEqual({ gallery: 'true' });
	});

	it('bundles bus names, members, and pullups, and nests inside other devices', () => {
		const { container } = render(
			<GCircuit>
				<GDevice name="page">
					<GDevice name="tabs" buses={{ nav: { wires: ['program', 'design'], pullup: 'program' } }}>
						<Show wire="program" />
						<Show wire="/page/tabs/design" />
					</GDevice>
				</GDevice>
			</GCircuit>,
		);
		expect(shown(container)).toEqual({ program: 'true', '/page/tabs/design': 'false' });
	});

	it('uninstalls on unmount, so the circuit forgets its wires', () => {
		let circuit: Circuit | undefined;
		function Grab() {
			circuit = useCircuit();
			return null;
		}
		function App({ withDevice }: { withDevice: boolean }) {
			return (
				<GCircuit>
					<Grab />
					{withDevice && <GDevice name="case-study" wires={{ gallery: { powered: true } }} />}
				</GCircuit>
			);
		}
		const { rerender } = render(<App withDevice />);
		expect(circuit?.measure('case-study/gallery').powered).toBe(true);
		rerender(<App withDevice={false} />);
		expect(circuit?.measure('case-study/gallery').powered).toBe(false);
	});

	it('keeps its wires’ state when it renders again', () => {
		let circuit: Circuit | undefined;
		function Grab() {
			circuit = useCircuit();
			return null;
		}
		function App({ label }: { label: string }) {
			return (
				<GCircuit>
					<Grab />
					<GDevice name="case-study" wires={{ gallery: { powered: true } }}>
						<Show wire="gallery" />
						{label}
					</GDevice>
				</GCircuit>
			);
		}
		const { rerender, container } = render(<App label="a" />);
		act(() => circuit?.power('case-study/gallery', false));
		rerender(<App label="b" />);
		expect(shown(container)).toEqual({ gallery: 'false' });
	});

	it('installs once under StrictMode, so unmounting still forgets its wires', () => {
		let circuit: Circuit | undefined;
		function Grab() {
			circuit = useCircuit();
			return null;
		}
		const { unmount, container } = render(
			<StrictMode>
				<GCircuit>
					<Grab />
					<GDevice name="case-study" wires={{ gallery: { powered: true } }}>
						<Show wire="gallery" />
					</GDevice>
				</GCircuit>
			</StrictMode>,
		);
		expect(shown(container)).toEqual({ gallery: 'true' });
		const kept = circuit;
		unmount();
		expect(kept?.measure('case-study/gallery').powered).toBe(false);
	});
});
