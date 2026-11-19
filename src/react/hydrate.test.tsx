import { act } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { GCircuit } from './GCircuit.js';
import { GDevice } from './GDevice.js';
import { usePower } from './hooks.js';
import { GReceiver } from './receiver.js';

function Readout({ wire }: { wire: string }) {
	return <output>{String(usePower(wire))}</output>;
}

describe('hydration', () => {
	it('matches the prerendered HTML, so React keeps it instead of re-rendering', async () => {
		const tree = (
			<GCircuit
				wires={{ menu: { powered: true } }}
				buses={{ nav: { wires: ['program', 'design'], pullup: 'program' } }}
			>
				<GReceiver wire="menu" inert />
				<GReceiver wire="design" inert />
				<GDevice name="case-study" wires={{ gallery: { powered: true } }}>
					<Readout wire="gallery" />
				</GDevice>
			</GCircuit>
		);
		const container = document.createElement('div');
		container.innerHTML = renderToString(tree);
		const prerendered = container.innerHTML;

		// React reports a mismatch one of two ways: text mismatches are errors it recovers from (by
		// rendering from scratch), and attribute mismatches are only logged with console.error.
		const recovered: unknown[] = [];
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

		await act(async () => {
			hydrateRoot(container, tree, {
				onRecoverableError: (error) => recovered.push(error),
			});
		});

		// Read the calls before restoring, which clears them, and restore before asserting, so a
		// failure doesn't leave console.error silenced for later tests.
		const logged = errors.mock.calls;
		errors.mockRestore();
		expect(recovered).toEqual([]);
		expect(logged).toEqual([]);
		expect(container.innerHTML).toBe(prerendered);
	});
});
