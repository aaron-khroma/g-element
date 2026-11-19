import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { Slot } from './slot.js';

describe('Slot', () => {
	it('gives its props to the child element, whose own props win', () => {
		const { container } = render(
			<Slot id="slot" title="from slot" data-g-power="on">
				<nav title="from child" />
			</Slot>,
		);
		const nav = container.querySelector('nav');
		expect(nav?.id).toBe('slot');
		expect(nav?.title).toBe('from child');
		expect(nav?.getAttribute('data-g-power')).toBe('on');
	});

	it('runs both event handlers, the child’s first', () => {
		const calls: string[] = [];
		const { getByRole } = render(
			<Slot onClick={() => calls.push('slot')}>
				<button onClick={() => calls.push('child')}>Go</button>
			</Slot>,
		);
		fireEvent.click(getByRole('button'));
		expect(calls).toEqual(['child', 'slot']);
	});

	it('joins class names and merges styles', () => {
		const { container } = render(
			<Slot className="a" style={{ color: 'red', margin: 0 }}>
				<div className="b" style={{ color: 'blue' }} />
			</Slot>,
		);
		const div = container.querySelector('div');
		expect(div?.className).toBe('a b');
		expect(div?.style.color).toBe('blue');
		expect(div?.style.margin).toBe('0px');
	});

	it('gives the element to both refs, and keeps the merged ref across renders', () => {
		const slotRef = vi.fn();
		const childRef = createRef<HTMLDivElement>();
		const tree = () => (
			<Slot ref={slotRef}>
				<div ref={childRef} />
			</Slot>
		);
		const { rerender, unmount } = render(tree());
		rerender(tree());
		expect(childRef.current).toBeInstanceOf(HTMLDivElement);
		expect(slotRef.mock.calls).toEqual([[childRef.current]]);
		unmount();
		expect(childRef.current).toBeNull();
		expect(slotRef).toHaveBeenLastCalledWith(null);
	});

	it('needs a single element child', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(() => render(<Slot>text</Slot>)).toThrow(/single element child/);
		vi.restoreAllMocks();
	});
});
