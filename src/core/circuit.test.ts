import { createCircuit } from './circuit.js';

describe('createCircuit', () => {
	it('reads unknown wires as unpowered with no signal', () => {
		expect(createCircuit().read('theme')).toEqual({ powered: false, signal: null });
	});

	it('drives power and signal independently', () => {
		const circuit = createCircuit();
		circuit.drive('theme', { signal: 'night' });
		circuit.drive('theme', { powered: true });
		expect(circuit.read('theme')).toEqual({ powered: true, signal: 'night' });
	});

	it('notifies subscribers only on real changes, and stops after unsubscribe', () => {
		const circuit = createCircuit();
		const listener = vi.fn();
		const unsubscribe = circuit.subscribe('menu', listener);
		circuit.drive('menu', { powered: true });
		circuit.drive('menu', { powered: true });
		expect(listener).toHaveBeenCalledTimes(1);
		unsubscribe();
		circuit.drive('menu', { powered: false });
		expect(listener).toHaveBeenCalledTimes(1);
	});
});
