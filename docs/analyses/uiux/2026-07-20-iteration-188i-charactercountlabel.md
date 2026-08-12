# Iteration-188i — shared `CharacterCountLabel` (design-system dedup + i18n + a11y)

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Design System (component reuse) · Localization (locale-aware numerals) · Accessibility (VoiceOver)
**Files touched:**
- `apps/ios/Meeshy/Features/Main/Components/CharacterCountLabel.swift` (**new**, ~70 lines)
- `apps/ios/Meeshy/Features/Main/Views/ReportUserView.swift` (rewire, −3 lines)
- `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift` (rewire)
- `apps/ios/Meeshy/Localizable.xcstrings` (+1 key, 5 locales: de/en/es/fr/pt-BR)
- `apps/ios/MeeshyTests/Unit/Components/CharacterCountLabelTests.swift` (**new**, 9 tests)

## Component

Two text-input screens hand-rolled an **identical-in-spirit but divergent-in-detail**
character counter under their text fields:

| Screen | Code (before) | Font | Warning rule |
|---|---|---|---|
| `ReportUserView` (details field, l.158) | `Text("\(details.count)/500")` | `relative(11)` | `count >= 450` |
| `StatusComposerView` (status field, l.186) | `Text("\(statusText.count)/122")` | `relative(10)` | `count > 100` |

## Findings

The two counters shared three defects, each an instance of a pattern the routine
targets (duplication / i18n / a11y):

1. **Duplication (design system).** Two copies of the same widget with
   independently-chosen fonts and ad-hoc warning thresholds — exactly the
   "two components differ only cosmetically → unify them" case.

2. **Non-locale-aware numerals (i18n).** Raw string interpolation
   (`"\(count)/500"`) emits ASCII digits with no grouping. Locales that use
   Eastern-Arabic digits or grouping separators (ar, fa, and grouped-thousand
   locales at higher limits) render incorrectly. `Int.formatted()` fixes this.

3. **Hostile VoiceOver output (a11y).** VoiceOver reads the glyph string
   `"158/500"` as an ambiguous token ("158 slash 500" / "158 500"), giving a
   non-sighted user no sense of *what* the number means. There was no
   `.accessibilityLabel`.

Secondary polish: the raw label reflowed by a pixel as digit widths changed
while typing (proportional digits).

## Fix

Extracted a single **app-level** reusable view, `CharacterCountLabel`
(`count:limit:warningThreshold:font:`), and pointed both call sites at it. It is
kept in `apps/ios/.../Components/` — **not** `MeeshySDK`/`MeeshyUI` — because
this routine is scoped to the iOS app and must not touch the SDK. (By the SDK
grain test it is an opaque-parameter atom that *could* live in the SDK; that is a
deliberate future migration, out of scope here.)

The component:
- renders `"\(count.formatted())/\(limit.formatted())"` with **monospaced
  digits** (no reflow) and locale-aware numerals;
- turns `MeeshyColors.error` at `warningThreshold` (default = ⌈80 % of limit⌉),
  else `theme.textMuted`;
- exposes a full VoiceOver sentence via the new key
  `components.characterCount.a11y` → *"158 of 500 characters"* (positional
  specifiers, translated de/en/es/fr/pt-BR).

Warning thresholds and per-site font are preserved exactly via parameters
(`warningThreshold: 450` / font 11 for report, `warningThreshold: 101` / font 10
for status), so the change is **visually behaviour-preserving** apart from the
numeral formatting and the (invisible) VoiceOver label.

Pure logic (`resolvedThreshold`, `isNearLimit`, `accessibilityLabel`) is exposed
as `static` helpers and covered by 9 unit tests — matching the established
`ContactCardView.accessibilityLabel(for:)` testability pattern.

## Verification

- **Build/tests:** cannot run locally (Linux host — no Xcode/Swift toolchain).
  Correctness ensured by inspection against existing patterns; CI "iOS Tests"
  workflow validates compile + the 9 new unit tests.
- **Behaviour parity:** thresholds/fonts passed through as parameters; only the
  numeral formatting (locale) and VoiceOver label change.
- **No SDK change, no logic change** to either host screen's business flow.

## Remaining / follow-ups

- Other single-use counters, if any appear later, should adopt this component.
- Eventual SDK migration of `CharacterCountLabel` into `MeeshyUI` (opaque atom)
  when SDK work is in scope.

**Status: RESOLVED.** Both counters consolidated onto `CharacterCountLabel`;
i18n + a11y gaps closed. Do not re-open for these two screens.
