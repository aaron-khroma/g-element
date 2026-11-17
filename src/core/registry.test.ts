import { createCircuit } from './circuit.js';
import { createRegistry } from './registry.js';

describe('registry', () => {
	it('lists connections in the order they were made', () => {
		const registry = createRegistry();
		registry.connect('menu', { kind: 'input', label: 'Menu button' });
		registry.connect('menu', { kind: 'load', label: 'nav' });
		expect(registry.connections('menu').map((c) => c.label)).toEqual(['Menu button', 'nav']);
	});

	it('returns the same array until the wire’s connections change', () => {
		const registry = createRegistry();
		const empty = registry.connections('menu');
		expect(registry.connections('other')).toBe(empty);
		registry.connect('menu', { kind: 'load', label: 'nav' });
		const one = registry.connections('menu');
		expect(one).not.toBe(empty);
		expect(registry.connections('menu')).toBe(one);
		expect(Object.isFrozen(one)).toBe(true);
	});

	it('disconnects only the connection it made, once', () => {
		const registry = createRegistry();
		const same = { kind: 'load', label: 'nav' } as const;
		const first = registry.connect('menu', same);
		registry.connect('menu', same);
		first();
		first();
		expect(registry.connections('menu')).toHaveLength(1);
	});

	it('tells connection probes which wire changed', () => {
		const registry = createRegistry();
		const probe = vi.fn();
		const detach = registry.probeConnections(probe);
		const disconnect = registry.connect('menu', { kind: 'part', label: 'GSwitch' });
		disconnect();
		expect(probe.mock.calls).toEqual([['menu'], ['menu']]);
		detach();
		registry.connect('menu', { kind: 'part', label: 'GSwitch' });
		expect(probe).toHaveBeenCalledTimes(2);
	});

	it('comes with every circuit, separate from wire probes', () => {
		const circuit = createCircuit();
		const wireProbe = vi.fn();
		circuit.probeAll(wireProbe);
		circuit.connect('menu', { kind: 'load', label: 'nav' });
		expect(circuit.connections('menu')).toHaveLength(1);
		expect(wireProbe).not.toHaveBeenCalled();
	});
});
