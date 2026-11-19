// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { GCircuit } from './GCircuit.js';
import { GDevice } from './GDevice.js';
import { usePower, useSignal } from './hooks.js';
import { GReceiver, useReceiver } from './receiver.js';

function Panel({ wire }: { wire: string }) {
	return <nav id={wire} {...useReceiver(wire, { inert: true })} />;
}

function Readout({ wire }: { wire: string }) {
	return (
		<output id={`${wire}-readout`}>
			{String(usePower(wire))}/{useSignal(wire) ?? 'none'}
		</output>
	);
}

/** Prerender a tree and parse the HTML, so tests can query it. */
function prerender(tree: React.ReactNode) {
	const html = renderToString(tree);
	return {
		html,
		attribute(id: string, name: string) {
			const tag = new RegExp(`<[a-z]+ [^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? '';
			const value = new RegExp(` ${name}(?:="([^"]*)")?`).exec(tag);
			return value ? (value[1] ?? '') : null;
		},
	};
}

describe('prerendering', () => {
	it('runs without a DOM', () => {
		expect(typeof document).toBe('undefined');
	});

	it('renders starting states, signals, and inert into the HTML', () => {
		const page = prerender(
			<GCircuit wires={{ menu: { powered: true, signal: 'about' }, search: {} }}>
				<Panel wire="menu" />
				<Panel wire="search" />
				<Readout wire="menu" />
			</GCircuit>,
		);
		expect(page.attribute('menu', 'data-g-power')).toBe('on');
		expect(page.attribute('menu', 'data-g-edge')).toBe('on');
		expect(page.attribute('menu', 'data-g-signal')).toBe('about');
		expect(page.attribute('menu', 'inert')).toBeNull();
		expect(page.attribute('search', 'data-g-power')).toBe('off');
		expect(page.attribute('search', 'inert')).toBe('');
		expect(page.html).toContain('true<!-- -->/<!-- -->about');
	});

	it('renders pullups on', () => {
		const page = prerender(
			<GCircuit buses={{ nav: { wires: ['program', 'design'], pullup: 'program' } }}>
				<Panel wire="program" />
				<Panel wire="design" />
			</GCircuit>,
		);
		expect(page.attribute('program', 'data-g-power')).toBe('on');
		expect(page.attribute('design', 'data-g-power')).toBe('off');
	});

	it('renders a device’s starting states inside it', () => {
		const page = prerender(
			<GCircuit>
				<GDevice name="case-study" wires={{ gallery: { powered: true } }}>
					<GReceiver wire="gallery" id="gallery" />
				</GDevice>
			</GCircuit>,
		);
		expect(page.attribute('gallery', 'data-g-power')).toBe('on');
	});

	it('gives each prerender its own circuit', () => {
		const tree = (
			<GCircuit>
				<Panel wire="menu" />
			</GCircuit>
		);
		expect(prerender(tree).attribute('menu', 'data-g-power')).toBe('off');
		expect(prerender(tree).attribute('menu', 'data-g-power')).toBe('off');
	});
});
