# Iteration-177i — VoiceOver selection state for `ReportMessageSheet`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — report-reason radio selection
**File touched:** `apps/ios/Meeshy/Features/Main/Components/ReportMessageSheet.swift` (1 file, 0 logic, 0 new key, 0 new test)

## Component

`ReportMessageSheet` is the sheet presented when a user reports a message
(long-press menu → « Signaler »). It shows a scrollable radio list of seven
report reasons (`ReportType`: spam, inappropriate, harassment, violence,
hate speech, impersonation, other), each a selectable `Button` row with a
leading category icon, a label, a one-line description, and — when selected —
a trailing `checkmark.circle.fill`. Picking a reason reveals an optional
free-text details field and enables the toolbar **Send** action.

The sheet was already **100 % localized** (20 `String(localized:defaultValue:)`
call sites, including per-type label/description) and uses **only semantic
fonts** (`.callout`/`.subheadline`/`.caption`/`.footnote`/`.title3`). Dynamic
Type and i18n were therefore already sound — the entire remaining gap was
VoiceOver.

## Findings

The `reportTypeRow(_:)` radio row conveyed its **selected** state through
three purely visual channels and nothing else:

1. The leading icon and border/background tint switch to the conversation
   accent color.
2. A `checkmark.circle.fill` glyph appears (color-tinted).

There was **no `.accessibilityAddTraits(.isSelected)`**, so a VoiceOver user
sweeping the list heard every reason read identically — the currently chosen
reason was indistinguishable from the others. This is a **WCAG 1.4.1
(Use of Color)** failure and the same "state signalled by color/icon only"
gap resolved on prior selectable rows (149i `ChangePasswordView` checklist,
155i `MessageReactionsDetailView` filter capsules, 163i `AudioCarouselView`).

Secondarily, the two SF Symbols (leading category icon, trailing checkmark)
carried no `.accessibilityHidden(true)`. On a `Button`, decorative symbols add
no value once the label + description text is present, and the checkmark
duplicates the state the trait now conveys.

## Fix

Applied the canonical Apple selectable-row pattern, scoped to the row builder:

- `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` on the row
  `Button` — the selected reason is now announced as "selected" (localized by
  iOS, **0 new key**), replacing the color/icon-only signal.
- `.accessibilityHidden(true)` on the leading category `Image` and on the
  conditional `checkmark.circle.fill` — the row's `Button` already merges its
  two `Text` children (label + description) into one element with the
  `.isButton` trait, so VoiceOver now reads a single, clean stop
  ("Spam, Repetitive or promotional messages, selected, button") instead of
  the label plus decorative symbol noise.

No `.accessibilityElement(children: .combine)` was needed: a SwiftUI `Button`
already aggregates its label subtree into one accessibility element and adds
`.isButton`. Forcing `.combine` on a `Button` would fight that default; the
minimal, correct move is hiding the decorative glyphs and adding the state
trait.

## Rationale

Reporting a message is a low-frequency but high-stakes moderation action; a
VoiceOver user must be able to confirm *which* reason is armed before the
Send button enables. The label/description text and Dynamic Type were already
correct — the only missing signal was the selected state, which the fix now
exposes semantically without touching layout, color, logic, or the Indigo
visual identity.

## Verification

- **Static review:** `.accessibilityAddTraits(cond ? [.isSelected] : [])` and
  `.accessibilityHidden(true)` are standard SwiftUI iOS 16.0+ APIs with
  established precedent in this codebase (149i, 155i, 163i). App floor is
  iOS 16.0 — no availability guard needed. The conditional-trait ternary
  mirrors `MessageReactionsDetailView` (155i).
- **No visual/logic change:** the fix adds only accessibility modifiers; the
  visible row, selection animation, haptic, details field, and Send flow are
  untouched.
- **No test churn:** no test references `ReportMessageSheet` (grep across
  `MeeshyTests` / `MeeshyUITests` / `MeeshySDKTests` = 0). `ReportType` label /
  description / icon mappings are unchanged.
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green on the PR
  before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `PeopleDiscoveryView` / `DiscoveryTab` (`ContactsShared.swift:30-33`) —
  hardcoded, unaccented French enum raw values (`"Decouvrir"`, `"Demandes"`,
  `"Bloques"`) used as both visible `Text` and `.accessibilityLabel`;
  localization iteration candidate.
- `CrashReportSheet` — icon-only `ShareLink` with no `.accessibilityLabel`;
  expand/collapse `.onTapGesture` row lacks `.isButton` / hint.
- `VideoFullscreenPlayer` (`VideoLegacySupport.swift`) — icon-only `xmark`
  dismiss button with no label + a fixed `.system(size: 28)` glyph.

**Status: RESOLVED for `ReportMessageSheet` VoiceOver selection state.**
