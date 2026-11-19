---
'@styleeyes/g-element': minor
---

Add the React layer's foundation. `<GCircuit>` provides a circuit built from its `wires`, `buses`, and `breakpoints`; `<GDevice>` bundles the wires named inside it under its own name and installs its own schematic. `usePower`, `useSignal`, `useEdge`, `useWire`, and `useCircuit` read and change wires. `useReceiver` and `<GReceiver>` connect elements to wires with `data-g-power`, `data-g-edge`, `data-g-signal`, and optional `inert`, and hold each edge while the element's CSS transitions run. `Slot` gives a component's props to its child (`asChild`). Everything prerenders with the right starting states and hydrates without mismatches.
