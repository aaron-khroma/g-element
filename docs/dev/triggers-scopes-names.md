# Triggers, scopes, and wire paths

Three small parsers in `src/core/` turn the strings people write in JSX into plain data. They're pure functions: text in, frozen data out, and an `Error` naming the problem when the text is wrong. Being strict catches a malformed string at render, rather than leaving a button that silently does nothing. A well-formed but misspelled event, like `clik`, still parses: the browser just never fires it.

## Wire paths: `resolveWirePath`

[`names.ts`](../../src/core/names.ts). A component writes a **wire name**; the circuit keeps each wire under its **wire path**, like a file name and its path in folders ([SPEC.md §6.3](../SPEC.md)). Inside `<GDevice name="case-study">`, a plain name is **bundled** into the device, and a leading `/` reaches the app's root:

| Call                                             | Result                       |
| ------------------------------------------------ | ---------------------------- |
| `resolveWirePath('menu')`                        | `'menu'`                     |
| `resolveWirePath('gallery', 'case-study')`       | `'case-study/gallery'`       |
| `resolveWirePath('/theme', 'case-study')`        | `'theme'`                    |
| `resolveWirePath('slide', 'case-study/gallery')` | `'case-study/gallery/slide'` |

A nested device's own name resolves the same way against its parent device, which is how paths nest. Names with an empty part (`''`, `'menu/'`, `'a//b'`) throw.

## Breakpoint scopes: `parseScope`

[`scope.ts`](../../src/core/scope.ts). Scopes use Tailwind's meaning ([responsive design](https://tailwindcss.com/docs/responsive-design)): `md` is "md and wider", `max-md` is "narrower than md", and stacked prefixes must all match. `parseScope` turns one into a [media query](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries/Using_media_queries) in range syntax:

| Scope       | Query                                  |
| ----------- | -------------------------------------- |
| `''`        | `null` (every width)                   |
| `md`        | `(width >= 48rem)`                     |
| `max-md`    | `(width < 48rem)`                      |
| `md:max-lg` | `(width >= 48rem) and (width < 64rem)` |

Widths default to Tailwind's (`DEFAULT_BREAKPOINTS`), and an app can pass its own. An unknown breakpoint throws and lists the known ones. Core only builds the query. The React layer will hand it to `matchMedia` and check `.matches` when an event fires.

## Triggers: `parseTrigger`

[`trigger.ts`](../../src/core/trigger.ts). A trigger says which events operate an input:

```
trigger := entry (' ' entry)*
entry   := (prefix ':')* action
action  := event | event '|' event
```

- **One event latches** (P1 in [PLAN.md](../PLAN.md)): `click` does the part's action, such as toggling.
- **An `off|on` pair pulses** the wire: the on-event drives it and the off-event releases it. `mouseleave|mouseenter` is a hover.
- **Entries are independent**, and each has its own scope: `'max-md:click md:mouseleave|mouseenter'` clicks on phones and hovers on wider screens.

`parseTrigger` returns `TriggerEntry` objects: `{ scope: 'max-md', action: { kind: 'latch', event: 'click' } }`. The scope stays text, so the same `parseScope` serves triggers and configs like `noscroll="max-md"`. TypeScript's [discriminated union](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions) on `kind` means code that handles an action must check `kind` before it can read `event` or `on`/`off`.

The tests in `trigger.test.ts` list each rejected form: an empty event, an empty prefix, three events, the same event twice, and characters an event name can't have.
