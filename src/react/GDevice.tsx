import { useContext, useEffect, useId, type ReactNode } from 'react';
import { resolveWirePath, type BusSpec, type Schematic, type WireSpec } from '../core/index.js';
import { DeviceContext, useBoard } from './context.js';

export interface GDeviceProps {
	/** The device's name. Wires named inside it are bundled into it: `gallery` → `case-study/gallery`. */
	readonly name: string;
	/** Starting states for the device's wires, by wire name. */
	readonly wires?: Readonly<Record<string, WireSpec>>;
	/** Buses for the device's wires, by wire name. */
	readonly buses?: Readonly<Record<string, BusSpec>>;
	readonly children?: ReactNode;
}

/**
 * A device: parts and receivers working together on wires of their own. Wires named inside it are
 * bundled into it (`gallery` is the wire path `case-study/gallery`), so two devices can't collide.
 * Its schematic is installed while it renders, so its subtree prerenders with the right starting
 * states, and uninstalled when it unmounts. A new `name` makes a new device, with fresh state.
 */
export function GDevice({ name, wires, buses, children }: GDeviceProps): ReactNode {
	const devicePath = resolveWirePath(name, useContext(DeviceContext));
	return (
		<DeviceContext value={devicePath}>
			<Installed key={devicePath} schematic={bundle(devicePath, wires, buses)}>
				{children}
			</Installed>
		</DeviceContext>
	);
}

interface InstalledProps {
	readonly schematic: Schematic;
	readonly children?: ReactNode;
}

function Installed({ schematic, children }: InstalledProps): ReactNode {
	// `installs` maps each installed device's id to its uninstall function.
	const { circuit, installs } = useBoard();

	// Stable across re-renders (StrictMode's repeat render included), and the same on the server
	// and in the browser.
	const id = useId();

	// Install while rendering, so this render (and a prerender) already sees the starting states.
	// A repeat render finds the id already recorded, and does nothing.
	if (!installs.has(id)) installs.set(id, circuit.install(schematic));

	useEffect(() => {
		// StrictMode unmounts and remounts once in development, without rendering in between, so
		// the remount installs again here.
		if (!installs.has(id)) installs.set(id, circuit.install(schematic));

		return () => {
			installs.get(id)?.();
			installs.delete(id);
		};

		// The schematic is read once: starting states, like `<GCircuit>`'s.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [circuit, installs, id]);

	return children;
}

/** The schematic with every wire, bus, and bus member bundled into the device. */
function bundle(
	devicePath: string,
	wires: GDeviceProps['wires'] = {},
	buses: GDeviceProps['buses'] = {},
): Schematic {
	const toPath = (wireName: string) => resolveWirePath(wireName, devicePath);
	return {
		wires: Object.fromEntries(
			Object.entries(wires).map(([wireName, spec]) => [toPath(wireName), spec]),
		),
		buses: Object.fromEntries(
			Object.entries(buses).map(([busName, bus]) => [
				toPath(busName),
				{
					wires: bus.wires.map(toPath),
					...(bus.pullup !== undefined && { pullup: toPath(bus.pullup) }),
				},
			]),
		),
	};
}
