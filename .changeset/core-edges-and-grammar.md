---
'@styleeyes/g-element': minor
---

Add edges, wire names, breakpoint scopes, triggers, and the connection registry to core. Measurements now carry an `edge` (`off`, `rising`, `on`, `falling`) that settles once a frame has passed and every `holdEdge` hold is let go. `CircuitEnv` gains `requestFrame` and `cancelFrame`. New: `resolveWirePath`, which turns a wire name into the wire path the circuit uses (bundled into its device), `parseScope` for Tailwind-style breakpoint scopes, `parseTrigger` for trigger strings, and `connect` / `connections` / `probeConnections` on every circuit (also `createRegistry`).
