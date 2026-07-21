# Iteration-196i — VoiceOver selected-state for `MessageViewsDetailView` sub-filter capsules

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver / WCAG 1.4.1) — the "Vues" (read-status) sub-filter chips
**File touched:** `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsDetailView.swift` (1 file, +4 lines, 0 logic, 0 new i18n key, 0 SDK change, 0 new test, 0 visual change)

## Component

`MessageViewsDetailView` is the **Vues** tab of the message-detail sheet
(`MessageMoreSheet` → detail). Its `viewsFilterCapsule(_:accent:)` renders a
horizontal row of pill Buttons — **Envoyé / Remis / Lu / Non vu** (plus
**Écouté / Vu** when the message carries audio/video) — that switch which
read-status audience list is shown. Each capsule carries a monospaced count
badge and drives `@State var viewsFilter`.

## Finding

The capsule Button signalled its **active** state **by color alone**:

- fill: `isSelected ? accent.opacity(0.15) : …` (line 173)
- stroke: `isSelected ? accent.opacity(0.35) : .clear` (line 177)
- foreground: `isSelected ? accent : theme.textMuted` (line 179)

and carried **no** accessibility modifiers whatsoever (`grep
accessibilityAddTraits` in the file = 0 before this change). A VoiceOver user
sweeping the filter row heard "Lu, bouton" for every chip with **no way to
tell which one is currently applied** — a WCAG 1.4.1 (*Use of Color*) failure
and an HIG violation ("never rely on color alone to convey state").

This is the same class of gap already fixed on the **three sibling detail
views** in this exact folder:

- `MessageReactionsDetailView.swift:104` — emoji filter chips
- `MessageReportDetailView.swift:153`
- `MessageLanguageDetailView.swift:318`

`MessageViewsDetailView` was simply overlooked when the siblings were done —
it was **not** in scope of 178i (which only localized this file's send-history
card, marked "SOLDÉ" for that concern, and never touched the filter chips).

## Fix (idiome sibling `MessageReactionsDetailView:104`)

Appended a single modifier to the capsule Button, mirroring the proven sibling
line verbatim:

```swift
.accessibilityAddTraits(isSelected ? [.isSelected] : [])
```

`isSelected` (`viewsFilter == filter`) is already in scope at the top of the
function. VoiceOver now announces "… , sélectionné" on the active chip; the
visible labels, count badges, colors, spring animation, haptics, and the
`viewsFilter` state are all untouched. No `.accessibilityLabel` was added
(matching the sibling) — the Button's `Text(filter.label)` + count children
already provide the spoken name, and the labels are already localized via the
file's own `ViewsFilter.label` `String(localized:)` keys.

## Rationale

Read-status is a privacy-relevant surface (who saw / heard / watched a
message). A non-sighted user must be able to know **which audience filter is
active** before trusting the list below it. The trait is the smallest,
lowest-risk fix, it is the exact pattern the three siblings already ship, and
it introduces zero visual, logic, layout, or localization change.

## i18n

- **0 new keys.** The announced text reuses the existing localized
  `ViewsFilter.label` keys (`message-detail.views.sent/.delivered/.read/…`).
  The `.isSelected` trait's "selected" suffix is provided by the system in the
  user's VoiceOver language.

## Verification

- **Static review:** `.accessibilityAddTraits(_:)` and `AccessibilityTraits`
  are iOS 13.0+; app floor is iOS 16.0 — no availability guard needed.
  Accessibility modifiers do not affect hit-testing or layout, so the sighted
  tap-to-switch, the spring transition, and the count badges are unaffected.
- **No visual/logic change:** only one accessibility modifier was appended; the
  diff is +4 lines (1 modifier + 3 comment lines).
- **No test churn:** no test references `MessageViewsDetailView` filter chips
  (the file's existing tests, added in 144i #1974 / 178i, cover state icons and
  send-history copy, not the trait). No mocks or call sites change.
- **Contention:** 0 open PRs touch `MessageViewsDetailView` (scanned all open
  PRs; the dense `MessageDetail*` PR cluster #2178–#2182 targets
  `MessageDetailSheet` / `MessageLanguageDetailView`, not this file).
- **CI gate:** `iOS Tests` (macOS runner). This is a Linux container, so the
  compile/VoiceOver run happens in CI — confirm `iOS Tests` is green before
  merge.

## Remaining improvements (future iterations, surfaced during scan)

- `MessageEffectModifiers.swift:163/186/231` — hardcoded `#6366F1` / `#818CF8`
  should use `MeeshyColors.indigo500` / `indigo400` tokens (decorative
  animation overlays; 3 sites, own iteration).
- `ConversationPreferencesTab.swift:166/168` — raw `Color(hex: "A855F7")` on a
  content surface; **not** a zero-diff swap (nearest token `indigo600` shifts
  the hue), needs a design judgment call.

**Status: RESOLVED for `MessageViewsDetailView` sub-filter VoiceOver
selected-state. Do not re-flag.**
