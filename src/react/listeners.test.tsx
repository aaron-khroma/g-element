import { render } from '@testing-library/react';
import { parseTrigger } from '../core/index.js';
import { GCircuit } from './GCircuit.js';
import { attachTrigger, useTrigger, type TriggerHandlers } from './listeners.js';
import type { Media } from './media.js';

/** Media where exactly the scopes in `matching` apply. */
function fakeMedia(matching: Set<string>): Media {
	return {
		query: (scope) => {
			if (scope.includes('tablet')) throw new Error('Unknown breakpoint');
			return scope === '' ? null : scope;
		},
		matches: (scope) => scope === '' || matching.has(scope),
		subscribe: () => () => {},
	};
}

function fire(element: Element, type: string) {
	element.dispatchEvent(new Event(type));
}

describe('attachTrigger', () => {
	function setup(trigger: string, matching = new Set<string>()) {
		const element = document.createElement('button');
		const handlers = { latch: vi.fn(), pulse: vi.fn() };
		const detach = attachTrigger(element, parseTrigger(trigger), fakeMedia(matching), handlers);
		return { element, handlers, detach };
	}

	it('latches on a single event', () => {
		const { element, handlers } = setup('click');
		fire(element, 'click');
		expect(handlers.latch).toHaveBeenCalledTimes(1);
		expect(handlers.pulse).not.toHaveBeenCalled();
	});

	it('pulses on with the second event of a pair, and off with the first', () => {
		const { element, handlers } = setup('mouseleave|mouseenter');
		fire(element, 'mouseenter');
		fire(element, 'mouseleave');
		expect(handlers.pulse.mock.calls.map(([on]) => on)).toEqual([true, false]);
	});

	it('checks each entry’s breakpoint scope when its event fires', () => {
		const matching = new Set<string>();
		const { element, handlers } = setup('max-md:click md:mouseleave|mouseenter', matching);
		fire(element, 'click');
		fire(element, 'mouseenter');
		expect(handlers.latch).not.toHaveBeenCalled();
		matching.add('max-md');
		fire(element, 'click');
		fire(element, 'mouseenter');
		expect(handlers.latch).toHaveBeenCalledTimes(1);
		expect(handlers.pulse).not.toHaveBeenCalled();
	});

	it('skips disabled inputs', () => {
		const { element, handlers } = setup('focusin');
		element.setAttribute('aria-disabled', 'true');
		fire(element, 'focusin');
		element.removeAttribute('aria-disabled');
		element.disabled = true;
		fire(element, 'focusin');
		expect(handlers.latch).not.toHaveBeenCalled();
	});

	it('throws on an unknown breakpoint when attaching, not on the first event', () => {
		expect(() => setup('tablet:click')).toThrow(/Unknown breakpoint/);
	});

	it('removes every listener when detached', () => {
		const { element, handlers, detach } = setup('click mouseleave|mouseenter');
		detach();
		fire(element, 'click');
		fire(element, 'mouseenter');
		expect(handlers.latch).not.toHaveBeenCalled();
		expect(handlers.pulse).not.toHaveBeenCalled();
	});
});

describe('useTrigger', () => {
	function Input({ trigger, handlers }: { trigger: string; handlers: TriggerHandlers }) {
		return <button ref={useTrigger(trigger, handlers)}>Menu</button>;
	}

	function renderInput(trigger: string, handlers: TriggerHandlers) {
		const result = render(
			<GCircuit>
				<Input trigger={trigger} handlers={handlers} />
			</GCircuit>,
		);
		const button = result.getByRole('button');
		const rerender = (next: TriggerHandlers) =>
			result.rerender(
				<GCircuit>
					<Input trigger={trigger} handlers={next} />
				</GCircuit>,
			);
		return { ...result, button, rerender };
	}

	it('calls the latest handlers, without re-attaching when only the handlers change', () => {
		const add = vi.spyOn(HTMLButtonElement.prototype, 'addEventListener');
		const first = vi.fn();
		const second = vi.fn();
		const { button, rerender } = renderInput('click', { latch: first });
		rerender({ latch: second });
		fire(button, 'click');
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
		expect(add.mock.calls.filter(([type]) => type === 'click')).toHaveLength(1);
		add.mockRestore();
	});

	it('removes its listeners on unmount', () => {
		const latch = vi.fn();
		const { button, unmount } = renderInput('click', { latch });
		unmount();
		fire(button, 'click');
		expect(latch).not.toHaveBeenCalled();
	});
});
