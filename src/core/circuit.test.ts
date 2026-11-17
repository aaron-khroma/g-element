import { createCircuit, type CircuitEnv } from './circuit.js';

const OFF = { powered: false, signal: null, everPowered: false };

describe('measuring', () => {
	it('measures unknown wires as unpowered with no signal', () => {
		expect(createCircuit().measure('theme')).toEqual(OFF);
	});

	it('returns the same object until the wire changes', () => {
		const circuit = createCircuit();
		circuit.power('menu', true);
		const first = circuit.measure('menu');
		expect(Object.isFrozen(first)).toBe(true);
		circuit.power('menu', true);
		expect(circuit.measure('menu')).toBe(first);
		circuit.power('menu', false);
		expect(circuit.measure('menu')).not.toBe(first);
	});
});

describe('latch', () => {
	it('drives power and signal independently', () => {
		const circuit = createCircuit();
		circuit.setSignal('theme', 'night');
		circuit.power('theme', true);
		expect(circuit.measure('theme')).toEqual({ powered: true, signal: 'night', everPowered: true });
	});

	it('toggles between on and off', () => {
		const circuit = createCircuit();
		circuit.toggle('menu');
		expect(circuit.measure('menu').powered).toBe(true);
		circuit.toggle('menu');
		expect(circuit.measure('menu').powered).toBe(false);
	});

	it('remembers that a wire has been powered', () => {
		const circuit = createCircuit();
		circuit.power('gallery', true);
		circuit.power('gallery', false);
		expect(circuit.measure('gallery')).toEqual({ ...OFF, everPowered: true });
	});
});

describe('drivers', () => {
	it('powers a wire while any driver is active', () => {
		const circuit = createCircuit();
		const a = Symbol('a');
		const b = Symbol('b');
		circuit.drive('menu', a);
		circuit.drive('menu', b);
		circuit.release('menu', a);
		expect(circuit.measure('menu').powered).toBe(true);
		circuit.release('menu', b);
		expect(circuit.measure('menu').powered).toBe(false);
	});

	it('ORs drivers with the latch', () => {
		const circuit = createCircuit();
		const hover = Symbol('hover');
		circuit.power('menu', true);
		circuit.drive('menu', hover);
		circuit.release('menu', hover);
		expect(circuit.measure('menu').powered).toBe(true);
	});

	it("carries the newest driver's signal, then falls back to the latched signal", () => {
		const circuit = createCircuit();
		const programs = Symbol('program');
		const animates = Symbol('animate');
		circuit.setSignal('tagline', 'style');
		circuit.drive('tagline', programs, { signal: 'websites' });
		circuit.drive('tagline', animates, { signal: 'motion' });
		expect(circuit.measure('tagline').signal).toBe('motion');
		circuit.drive('tagline', programs, { signal: 'websites' });
		expect(circuit.measure('tagline').signal).toBe('websites');
		circuit.release('tagline', programs);
		expect(circuit.measure('tagline').signal).toBe('motion');
		circuit.release('tagline', animates);
		expect(circuit.measure('tagline').signal).toBe('style');
	});

	it('ignores releasing a driver that was never asserted', () => {
		const circuit = createCircuit();
		expect(() => circuit.release('menu', Symbol('nobody'))).not.toThrow();
		expect(circuit.measure('menu')).toEqual(OFF);
	});
});

describe('sustain-only drivers', () => {
	it('never turn a wire on', () => {
		const circuit = createCircuit();
		circuit.drive('menu', Symbol('hold'), { sustainOnly: true });
		expect(circuit.measure('menu').powered).toBe(false);
	});

	it('keep an already-powered wire on', () => {
		const circuit = createCircuit();
		const trigger = Symbol('trigger');
		const hold = Symbol('hold');
		circuit.drive('menu', trigger);
		circuit.drive('menu', hold, { sustainOnly: true });
		circuit.release('menu', trigger);
		expect(circuit.measure('menu').powered).toBe(true);
		circuit.release('menu', hold);
		expect(circuit.measure('menu').powered).toBe(false);
	});

	it('engage when asserted again after the wire powers on', () => {
		const circuit = createCircuit();
		const hold = Symbol('hold');
		circuit.drive('menu', hold, { sustainOnly: true });
		circuit.power('menu', true);
		circuit.drive('menu', hold, { sustainOnly: true });
		circuit.power('menu', false);
		circuit.power('menu', true);
		expect(circuit.measure('menu').powered).toBe(true);
	});
});

describe('trip', () => {
	it('clears the latch and cuts active drivers', () => {
		const circuit = createCircuit();
		const hover = Symbol('hover');
		circuit.power('menu', true);
		circuit.drive('menu', hover);
		circuit.power('menu', false);
		expect(circuit.measure('menu').powered).toBe(false);
	});

	it('can be called directly, and keeps re-driven drivers cut', () => {
		const circuit = createCircuit();
		const hover = Symbol('hover');
		circuit.drive('menu', hover);
		circuit.trip('menu');
		expect(circuit.measure('menu').powered).toBe(false);
		circuit.drive('menu', hover);
		expect(circuit.measure('menu').powered).toBe(false);
	});

	it('keeps a driver cut until it is released and asserted again', () => {
		const circuit = createCircuit();
		const hover = Symbol('hover');
		circuit.drive('menu', hover);
		circuit.power('menu', false);
		circuit.drive('menu', hover);
		expect(circuit.measure('menu').powered).toBe(false);
		circuit.release('menu', hover);
		circuit.drive('menu', hover);
		expect(circuit.measure('menu').powered).toBe(true);
	});

	it('also cuts a driver’s signal', () => {
		const circuit = createCircuit();
		circuit.drive('tagline', Symbol('verb'), { signal: 'websites' });
		circuit.power('tagline', false);
		expect(circuit.measure('tagline').signal).toBeNull();
	});
});

describe('delayed release', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('keeps the driver active until the delay passes', () => {
		const circuit = createCircuit();
		const hover = Symbol('hover');
		circuit.drive('menu', hover);
		circuit.release('menu', hover, { delay: 300 });
		vi.advanceTimersByTime(299);
		expect(circuit.measure('menu').powered).toBe(true);
		vi.advanceTimersByTime(1);
		expect(circuit.measure('menu').powered).toBe(false);
	});

	it('is cancelled by driving again within the delay', () => {
		const circuit = createCircuit();
		const hover = Symbol('hover');
		circuit.drive('menu', hover);
		circuit.release('menu', hover, { delay: 300 });
		vi.advanceTimersByTime(200);
		circuit.drive('menu', hover);
		vi.advanceTimersByTime(500);
		expect(circuit.measure('menu').powered).toBe(true);
	});

	it('restarts the delay when released again', () => {
		const circuit = createCircuit();
		const hover = Symbol('hover');
		circuit.drive('menu', hover);
		circuit.release('menu', hover, { delay: 300 });
		vi.advanceTimersByTime(200);
		circuit.release('menu', hover, { delay: 300 });
		vi.advanceTimersByTime(200);
		expect(circuit.measure('menu').powered).toBe(true);
		vi.advanceTimersByTime(100);
		expect(circuit.measure('menu').powered).toBe(false);
	});

	it('cancels a waiting delay when released at once, so it never removes a later driver', () => {
		const circuit = createCircuit();
		const hover = Symbol('hover');
		circuit.drive('menu', hover);
		circuit.release('menu', hover, { delay: 300 });
		circuit.release('menu', hover);
		circuit.drive('menu', hover);
		vi.advanceTimersByTime(300);
		expect(circuit.measure('menu').powered).toBe(true);
	});

	it('removes a cut driver at once, so asserting it again engages', () => {
		const circuit = createCircuit();
		const hover = Symbol('hover');
		circuit.drive('menu', hover);
		circuit.power('menu', false);
		circuit.release('menu', hover, { delay: 300 });
		circuit.drive('menu', hover);
		expect(circuit.measure('menu').powered).toBe(true);
	});

	it("doesn't remove the driver after its wire was uninstalled and installed again", () => {
		const circuit = createCircuit();
		const hover = Symbol('hover');
		const uninstall = circuit.install({ wires: { menu: {} } });
		circuit.drive('menu', hover);
		circuit.release('menu', hover, { delay: 300 });
		uninstall();
		circuit.install({ wires: { menu: {} } });
		circuit.drive('menu', hover);
		vi.advanceTimersByTime(300);
		expect(circuit.measure('menu').powered).toBe(true);
	});

	it('uses the injected timers', () => {
		const scheduled: (() => void)[] = [];
		const env: CircuitEnv = {
			setTimeout: (callback) => scheduled.push(callback),
			clearTimeout: () => {},
		};
		const circuit = createCircuit({}, env);
		const hover = Symbol('hover');
		circuit.drive('menu', hover);
		circuit.release('menu', hover, { delay: 300 });
		expect(scheduled).toHaveLength(1);
		scheduled[0]?.();
		expect(circuit.measure('menu').powered).toBe(false);
	});
});

describe('notifications', () => {
	it('notifies probes only on real changes, and stops once detached', () => {
		const circuit = createCircuit();
		const probe = vi.fn();
		const detach = circuit.probe('menu', probe);
		circuit.power('menu', true);
		circuit.power('menu', true);
		expect(probe).toHaveBeenCalledTimes(1);
		detach();
		circuit.power('menu', false);
		expect(probe).toHaveBeenCalledTimes(1);
	});

	it('tells all-wire probes which wire changed', () => {
		const circuit = createCircuit();
		const probe = vi.fn();
		circuit.probeAll(probe);
		circuit.setSignal('theme', 'day');
		expect(probe).toHaveBeenCalledExactlyOnceWith('theme');
	});

	it('notifies once per operation, after every wire it touches is updated', () => {
		const circuit = createCircuit();
		const seen: boolean[] = [];
		circuit.probe('a', () => seen.push(circuit.measure('b').powered));
		circuit.install({ wires: { a: { powered: true }, b: { powered: true } } });
		expect(seen).toEqual([true]);
	});

	it('stays silent when an operation changes nothing', () => {
		const circuit = createCircuit();
		const probe = vi.fn();
		circuit.probeAll(probe);
		circuit.install({ wires: { menu: {}, theme: { powered: false } } });
		expect(probe).not.toHaveBeenCalled();
	});

	it('keeps the same reading when a wire ends an operation where it began', () => {
		const circuit = createCircuit({ buses: { nav: { wires: ['home', 'work'], pullup: 'home' } } });
		const before = circuit.measure('home');
		const probe = vi.fn();
		circuit.probe('home', probe);
		circuit.power('home', false); // the bus pulls it straight back on
		expect(probe).not.toHaveBeenCalled();
		expect(circuit.measure('home')).toBe(before);
	});

	it('delivers changes a probe makes, after the current ones', () => {
		const circuit = createCircuit();
		const order: string[] = [];
		circuit.probe('menu', () => {
			order.push('menu');
			circuit.power('backdrop', circuit.measure('menu').powered);
		});
		circuit.probe('backdrop', () => order.push('backdrop'));
		circuit.power('menu', true);
		expect(order).toEqual(['menu', 'backdrop']);
		expect(circuit.measure('backdrop').powered).toBe(true);
	});

	it('lets a probe detach others while being notified', () => {
		const circuit = createCircuit();
		const second = vi.fn();
		let detachSecond = () => {};
		circuit.probe('menu', () => detachSecond());
		detachSecond = circuit.probe('menu', second);
		circuit.power('menu', true);
		expect(second).toHaveBeenCalledTimes(1);
		circuit.power('menu', false);
		expect(second).toHaveBeenCalledTimes(1);
	});
});

describe('schematics', () => {
	it('sets starting states at creation', () => {
		const circuit = createCircuit({
			wires: { menu: { powered: true }, theme: { signal: 'auto' } },
		});
		expect(circuit.measure('menu').powered).toBe(true);
		expect(circuit.measure('theme').signal).toBe('auto');
	});

	it("doesn't reset a wire that's installed again", () => {
		const circuit = createCircuit({ wires: { menu: { powered: true } } });
		circuit.power('menu', false);
		circuit.install({ wires: { menu: { powered: true } } });
		expect(circuit.measure('menu').powered).toBe(false);
	});

	it('keeps state until the last install is removed, then forgets it', () => {
		const circuit = createCircuit();
		const first = circuit.install({ wires: { menu: { powered: true } } });
		const second = circuit.install({ wires: { menu: {} } });
		first();
		first();
		expect(circuit.measure('menu').powered).toBe(true);
		second();
		expect(circuit.measure('menu')).toEqual(OFF);
		circuit.install({ wires: { menu: { powered: true } } });
		expect(circuit.measure('menu').powered).toBe(true);
	});
});

describe('buses', () => {
	const nav = { wires: ['program', 'animate', 'design'], pullup: 'program' };

	it('lets only one member conduct', () => {
		const circuit = createCircuit({ buses: { nav } });
		circuit.power('animate', true);
		circuit.power('design', true);
		expect(circuit.measure('animate').powered).toBe(false);
		expect(circuit.measure('design').powered).toBe(true);
	});

	it('trips members held on by drivers', () => {
		const circuit = createCircuit({ buses: { nav } });
		circuit.drive('animate', Symbol('hover'));
		circuit.power('design', true);
		expect(circuit.measure('animate').powered).toBe(false);
	});

	it('starts with the pullup on', () => {
		const circuit = createCircuit({ buses: { nav } });
		expect(circuit.measure('program').powered).toBe(true);
	});

	it('starts with a member installed as powered instead of the pullup', () => {
		const circuit = createCircuit({ wires: { design: { powered: true } }, buses: { nav } });
		expect(circuit.measure('program').powered).toBe(false);
		expect(circuit.measure('design').powered).toBe(true);
	});

	it('powers the pullup when every member goes off', () => {
		const circuit = createCircuit({ buses: { nav } });
		circuit.power('design', true);
		expect(circuit.measure('program').powered).toBe(false);
		circuit.power('design', false);
		expect(circuit.measure('program').powered).toBe(true);
	});

	it('keeps the pullup on when it is turned off directly', () => {
		const circuit = createCircuit({ buses: { nav } });
		circuit.power('program', false);
		expect(circuit.measure('program').powered).toBe(true);
	});

	it('allows every member off without a pullup', () => {
		const circuit = createCircuit({ buses: { tabs: { wires: ['a', 'b'] } } });
		circuit.power('a', true);
		circuit.power('a', false);
		expect(circuit.measure('a').powered).toBe(false);
		expect(circuit.measure('b').powered).toBe(false);
	});

	it('stops excluding once the bus is uninstalled', () => {
		const circuit = createCircuit();
		const uninstall = circuit.install({ buses: { tabs: { wires: ['a', 'b'] } } });
		uninstall();
		circuit.power('a', true);
		circuit.power('b', true);
		expect(circuit.measure('a').powered).toBe(true);
	});

	it.each([
		['a pullup outside the bus', { buses: { tabs: { wires: ['a'], pullup: 'b' } } }],
		['a wire on two buses', { buses: { x: { wires: ['a'] }, y: { wires: ['a', 'b'] } } }],
		[
			'two members starting powered',
			{
				wires: { a: { powered: true }, b: { powered: true } },
				buses: { tabs: { wires: ['a', 'b'] } },
			},
		],
	])('rejects %s', (_, schematic) => {
		expect(() => createCircuit(schematic)).toThrow();
	});

	it('rejects reinstalling a bus with different wires, but accepts the same ones', () => {
		const circuit = createCircuit({ buses: { tabs: { wires: ['a', 'b'] } } });
		expect(() => circuit.install({ buses: { tabs: { wires: ['a', 'b'] } } })).not.toThrow();
		expect(() => circuit.install({ buses: { tabs: { wires: ['a', 'c'] } } })).toThrow();
	});
});
