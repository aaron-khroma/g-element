import { createCircuit, type CircuitEnv } from './circuit.js';

const OFF = { powered: false, signal: null, everPowered: false };

describe('reading', () => {
	it('reads unknown wires as unpowered with no signal', () => {
		expect(createCircuit().read('theme')).toEqual(OFF);
	});

	it('returns the same object until the wire changes', () => {
		const circuit = createCircuit();
		circuit.power('menu', true);
		const first = circuit.read('menu');
		expect(Object.isFrozen(first)).toBe(true);
		circuit.power('menu', true);
		expect(circuit.read('menu')).toBe(first);
		circuit.power('menu', false);
		expect(circuit.read('menu')).not.toBe(first);
	});
});

describe('latch', () => {
	it('drives power and signal independently', () => {
		const circuit = createCircuit();
		circuit.setSignal('theme', 'night');
		circuit.power('theme', true);
		expect(circuit.read('theme')).toEqual({ powered: true, signal: 'night', everPowered: true });
	});

	it('toggles between on and off', () => {
		const circuit = createCircuit();
		circuit.toggle('menu');
		expect(circuit.read('menu').powered).toBe(true);
		circuit.toggle('menu');
		expect(circuit.read('menu').powered).toBe(false);
	});

	it('remembers that a wire has been powered', () => {
		const circuit = createCircuit();
		circuit.power('gallery', true);
		circuit.power('gallery', false);
		expect(circuit.read('gallery')).toEqual({ ...OFF, everPowered: true });
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
		expect(circuit.read('menu').powered).toBe(true);
		circuit.release('menu', b);
		expect(circuit.read('menu').powered).toBe(false);
	});

	it('ORs drivers with the latch', () => {
		const circuit = createCircuit();
		const hover = Symbol('hover');
		circuit.power('menu', true);
		circuit.drive('menu', hover);
		circuit.release('menu', hover);
		expect(circuit.read('menu').powered).toBe(true);
	});

	it("carries the newest driver's signal, then falls back to the latched signal", () => {
		const circuit = createCircuit();
		const programs = Symbol('program');
		const animates = Symbol('animate');
		circuit.setSignal('tagline', 'style');
		circuit.drive('tagline', programs, { signal: 'websites' });
		circuit.drive('tagline', animates, { signal: 'motion' });
		expect(circuit.read('tagline').signal).toBe('motion');
		circuit.drive('tagline', programs, { signal: 'websites' });
		expect(circuit.read('tagline').signal).toBe('websites');
		circuit.release('tagline', programs);
		expect(circuit.read('tagline').signal).toBe('motion');
		circuit.release('tagline', animates);
		expect(circuit.read('tagline').signal).toBe('style');
	});

	it('ignores releasing a driver that was never asserted', () => {
		const circuit = createCircuit();
		expect(() => circuit.release('menu', Symbol('nobody'))).not.toThrow();
		expect(circuit.read('menu')).toEqual(OFF);
	});
});

describe('sustain-only drivers', () => {
	it('never turn a wire on', () => {
		const circuit = createCircuit();
		circuit.drive('menu', Symbol('hold'), { sustainOnly: true });
		expect(circuit.read('menu').powered).toBe(false);
	});

	it('keep an already-powered wire on', () => {
		const circuit = createCircuit();
		const trigger = Symbol('trigger');
		const hold = Symbol('hold');
		circuit.drive('menu', trigger);
		circuit.drive('menu', hold, { sustainOnly: true });
		circuit.release('menu', trigger);
		expect(circuit.read('menu').powered).toBe(true);
		circuit.release('menu', hold);
		expect(circuit.read('menu').powered).toBe(false);
	});

	it('start counting when asserted again after the wire powers on', () => {
		const circuit = createCircuit();
		const hold = Symbol('hold');
		circuit.drive('menu', hold, { sustainOnly: true });
		circuit.power('menu', true);
		circuit.drive('menu', hold, { sustainOnly: true });
		circuit.power('menu', false);
		circuit.power('menu', true);
		expect(circuit.read('menu').powered).toBe(true);
	});
});

describe('hard off', () => {
	it('clears the latch and cuts active drivers', () => {
		const circuit = createCircuit();
		const hover = Symbol('hover');
		circuit.power('menu', true);
		circuit.drive('menu', hover);
		circuit.power('menu', false);
		expect(circuit.read('menu').powered).toBe(false);
	});

	it('keeps a driver cut until it is released and asserted again', () => {
		const circuit = createCircuit();
		const hover = Symbol('hover');
		circuit.drive('menu', hover);
		circuit.power('menu', false);
		circuit.drive('menu', hover);
		expect(circuit.read('menu').powered).toBe(false);
		circuit.release('menu', hover);
		circuit.drive('menu', hover);
		expect(circuit.read('menu').powered).toBe(true);
	});

	it('also cuts a driver’s signal', () => {
		const circuit = createCircuit();
		circuit.drive('tagline', Symbol('verb'), { signal: 'websites' });
		circuit.power('tagline', false);
		expect(circuit.read('tagline').signal).toBeNull();
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
		expect(circuit.read('menu').powered).toBe(true);
		vi.advanceTimersByTime(1);
		expect(circuit.read('menu').powered).toBe(false);
	});

	it('is cancelled by driving again within the delay', () => {
		const circuit = createCircuit();
		const hover = Symbol('hover');
		circuit.drive('menu', hover);
		circuit.release('menu', hover, { delay: 300 });
		vi.advanceTimersByTime(200);
		circuit.drive('menu', hover);
		vi.advanceTimersByTime(500);
		expect(circuit.read('menu').powered).toBe(true);
	});

	it('restarts the delay when released again', () => {
		const circuit = createCircuit();
		const hover = Symbol('hover');
		circuit.drive('menu', hover);
		circuit.release('menu', hover, { delay: 300 });
		vi.advanceTimersByTime(200);
		circuit.release('menu', hover, { delay: 300 });
		vi.advanceTimersByTime(200);
		expect(circuit.read('menu').powered).toBe(true);
		vi.advanceTimersByTime(100);
		expect(circuit.read('menu').powered).toBe(false);
	});

	it('removes a cut driver at once, so asserting it again counts', () => {
		const circuit = createCircuit();
		const hover = Symbol('hover');
		circuit.drive('menu', hover);
		circuit.power('menu', false);
		circuit.release('menu', hover, { delay: 300 });
		circuit.drive('menu', hover);
		expect(circuit.read('menu').powered).toBe(true);
	});

	it("doesn't remove the driver after its wire was undeclared and declared again", () => {
		const circuit = createCircuit();
		const hover = Symbol('hover');
		const undeclare = circuit.declare({ wires: { menu: {} } });
		circuit.drive('menu', hover);
		circuit.release('menu', hover, { delay: 300 });
		undeclare();
		circuit.declare({ wires: { menu: {} } });
		circuit.drive('menu', hover);
		vi.advanceTimersByTime(300);
		expect(circuit.read('menu').powered).toBe(true);
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
		expect(circuit.read('menu').powered).toBe(false);
	});
});

describe('notifications', () => {
	it('notifies subscribers only on real changes, and stops after unsubscribe', () => {
		const circuit = createCircuit();
		const listener = vi.fn();
		const unsubscribe = circuit.subscribe('menu', listener);
		circuit.power('menu', true);
		circuit.power('menu', true);
		expect(listener).toHaveBeenCalledTimes(1);
		unsubscribe();
		circuit.power('menu', false);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('tells all-wire subscribers which wire changed', () => {
		const circuit = createCircuit();
		const listener = vi.fn();
		circuit.subscribeAll(listener);
		circuit.setSignal('theme', 'day');
		expect(listener).toHaveBeenCalledExactlyOnceWith('theme');
	});

	it('notifies once per operation, after every wire it touches is updated', () => {
		const circuit = createCircuit();
		const seen: boolean[] = [];
		circuit.subscribe('a', () => seen.push(circuit.read('b').powered));
		circuit.declare({ wires: { a: { powered: true }, b: { powered: true } } });
		expect(seen).toEqual([true]);
	});

	it('stays silent when an operation changes nothing', () => {
		const circuit = createCircuit();
		const listener = vi.fn();
		circuit.subscribeAll(listener);
		circuit.declare({ wires: { menu: {}, theme: { powered: false } } });
		expect(listener).not.toHaveBeenCalled();
	});

	it('keeps the same snapshot when a wire ends an operation where it began', () => {
		const circuit = createCircuit({ buses: { nav: { wires: ['home', 'work'], pullup: 'home' } } });
		const before = circuit.read('home');
		const listener = vi.fn();
		circuit.subscribe('home', listener);
		circuit.power('home', false); // the bus pulls it straight back on
		expect(listener).not.toHaveBeenCalled();
		expect(circuit.read('home')).toBe(before);
	});

	it('delivers changes a listener makes, after the current ones', () => {
		const circuit = createCircuit();
		const order: string[] = [];
		circuit.subscribe('menu', () => {
			order.push('menu');
			circuit.power('backdrop', circuit.read('menu').powered);
		});
		circuit.subscribe('backdrop', () => order.push('backdrop'));
		circuit.power('menu', true);
		expect(order).toEqual(['menu', 'backdrop']);
		expect(circuit.read('backdrop').powered).toBe(true);
	});

	it('lets a listener unsubscribe others while being notified', () => {
		const circuit = createCircuit();
		const second = vi.fn();
		let unsubscribeSecond = () => {};
		circuit.subscribe('menu', () => unsubscribeSecond());
		unsubscribeSecond = circuit.subscribe('menu', second);
		circuit.power('menu', true);
		expect(second).toHaveBeenCalledTimes(1);
		circuit.power('menu', false);
		expect(second).toHaveBeenCalledTimes(1);
	});
});

describe('declarations', () => {
	it('sets starting states at creation', () => {
		const circuit = createCircuit({
			wires: { menu: { powered: true }, theme: { signal: 'auto' } },
		});
		expect(circuit.read('menu').powered).toBe(true);
		expect(circuit.read('theme').signal).toBe('auto');
	});

	it("doesn't reset a wire that's declared again", () => {
		const circuit = createCircuit({ wires: { menu: { powered: true } } });
		circuit.power('menu', false);
		circuit.declare({ wires: { menu: { powered: true } } });
		expect(circuit.read('menu').powered).toBe(false);
	});

	it('keeps state until the last declaration is removed, then forgets it', () => {
		const circuit = createCircuit();
		const first = circuit.declare({ wires: { menu: { powered: true } } });
		const second = circuit.declare({ wires: { menu: {} } });
		first();
		first();
		expect(circuit.read('menu').powered).toBe(true);
		second();
		expect(circuit.read('menu')).toEqual(OFF);
		circuit.declare({ wires: { menu: { powered: true } } });
		expect(circuit.read('menu').powered).toBe(true);
	});
});

describe('buses', () => {
	const nav = { wires: ['program', 'animate', 'design'], pullup: 'program' };

	it('lets only one member conduct', () => {
		const circuit = createCircuit({ buses: { nav } });
		circuit.power('animate', true);
		circuit.power('design', true);
		expect(circuit.read('animate').powered).toBe(false);
		expect(circuit.read('design').powered).toBe(true);
	});

	it('hard-offs members held on by drivers', () => {
		const circuit = createCircuit({ buses: { nav } });
		circuit.drive('animate', Symbol('hover'));
		circuit.power('design', true);
		expect(circuit.read('animate').powered).toBe(false);
	});

	it('starts with the pullup on', () => {
		const circuit = createCircuit({ buses: { nav } });
		expect(circuit.read('program').powered).toBe(true);
	});

	it('starts with a declared member on instead of the pullup', () => {
		const circuit = createCircuit({ wires: { design: { powered: true } }, buses: { nav } });
		expect(circuit.read('program').powered).toBe(false);
		expect(circuit.read('design').powered).toBe(true);
	});

	it('powers the pullup when every member goes off', () => {
		const circuit = createCircuit({ buses: { nav } });
		circuit.power('design', true);
		expect(circuit.read('program').powered).toBe(false);
		circuit.power('design', false);
		expect(circuit.read('program').powered).toBe(true);
	});

	it('keeps the pullup on when it is turned off directly', () => {
		const circuit = createCircuit({ buses: { nav } });
		circuit.power('program', false);
		expect(circuit.read('program').powered).toBe(true);
	});

	it('allows every member off without a pullup', () => {
		const circuit = createCircuit({ buses: { tabs: { wires: ['a', 'b'] } } });
		circuit.power('a', true);
		circuit.power('a', false);
		expect(circuit.read('a').powered).toBe(false);
		expect(circuit.read('b').powered).toBe(false);
	});

	it('stops excluding once the bus is undeclared', () => {
		const circuit = createCircuit();
		const undeclare = circuit.declare({ buses: { tabs: { wires: ['a', 'b'] } } });
		undeclare();
		circuit.power('a', true);
		circuit.power('b', true);
		expect(circuit.read('a').powered).toBe(true);
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
	])('rejects %s', (_, declarations) => {
		expect(() => createCircuit(declarations)).toThrow();
	});

	it('rejects redeclaring a bus with different wires, but accepts the same ones', () => {
		const circuit = createCircuit({ buses: { tabs: { wires: ['a', 'b'] } } });
		expect(() => circuit.declare({ buses: { tabs: { wires: ['a', 'b'] } } })).not.toThrow();
		expect(() => circuit.declare({ buses: { tabs: { wires: ['a', 'c'] } } })).toThrow();
	});
});
