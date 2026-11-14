---
'@styleeyes/g-element': minor
---

Rework the circuit store around latches and momentary drivers. Wires now resolve power and signal from a latch (`power`, `toggle`, `setSignal`) and from drivers (`drive`, `release` with an optional delay, sustain-only holds). Hard off, buses with pullups, reference-counted declarations, `subscribeAll`, `everPowered`, and injectable timers are new. `drive(wire, partial)` is replaced by `power` and `setSignal`.
