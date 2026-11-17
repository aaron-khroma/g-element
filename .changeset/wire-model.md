---
'@styleeyes/g-element': minor
---

Rework the circuit store around latches and momentary drivers, with circuit vocabulary throughout. Wires resolve power and signal from a latch (`power`, `toggle`, `setSignal`) and from drivers (`drive`, `release` with an optional delay, sustain-only holds). `measure(wire)` returns a frozen `Measurement`, and `probe` / `probeAll` watch for changes. `trip` cuts a wire like a breaker. Schematics (`install`) declare starting states and buses with pullups, reference-counted. `everPowered` and injectable timers are new. `read`, `subscribe`, and `drive(wire, partial)` are replaced.
