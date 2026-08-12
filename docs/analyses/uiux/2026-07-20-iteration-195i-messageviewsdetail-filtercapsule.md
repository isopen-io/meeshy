# Iteration-195i — VoiceOver selected-state + count for `MessageViewsDetailView` filter capsules

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver / WCAG 1.4.1) — "Who has seen" tab filter picker
**File touched:** `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsDetailView.swift` (1 file, 0 logic, 0 new i18n key, 0 SDK change, 0 new test)

## Component

`MessageViewsDetailView` is the "Who has seen" tab of the message detail sheet
(long-press a message → details → Views). Its horizontal-scroll filter row
(`ForEach(availableViewsFilters)` → `viewsFilterCapsule(_:accent:)`) lets the
user switch between **Sent / Delivered / Read / Not seen / Listened / Seen**,
each pill carrying an icon, a localized label, and — for the count-bearing
filters — a numeric badge (received / read / not-seen / listened / watched
counts).

## Finding (WCAG 1.4.1 — color-only state)

The active filter capsule was signalled **exclusively by color**:

```swift
.background(Capsule().fill(isSelected ? accent.opacity(0.15) : …))   // color only
.overlay(Capsule().stroke(isSelected ? accent.opacity(0.35) : .clear)) // color only
.foregroundColor(isSelected ? accent : theme.textMuted)              // color only
```

The `Button` carried **zero accessibility modifiers** — no
`.accessibilityAddTraits(.isSelected)` and no explicit label. Two consequences
for a VoiceOver user:

1. **Active state was lost.** With state expressed only through fill/stroke/
   foreground color, VoiceOver announced every capsule identically — the user
   could not tell which filter was active. A WCAG 1.4.1 (Use of Color) failure.
2. **The count risked being lost or noisy.** The visible count badge conveys
   real information (how many recipients read / listened / watched). Relying on
   the Button's auto-derived label also let the decorative SF Symbol icon leak
   into the announcement.

This is a **direct consistency miss**: the two sibling detail views were
already patched for exactly this pattern —
`MessageReactionsDetailView.reactionFilterCapsule` carries
`.accessibilityAddTraits(isSelected ? [.isSelected] : [])` with the comment
*"never rely on color to convey state"*, and `MessageReportDetailView` was
likewise fixed. `MessageViewsDetailView` was skipped. Prior iterations on this
file addressed **different** sub-components (144i = state-icon Dynamic Type +
VoiceOver; 178i = send-history card localization + VoiceOver) and never touched
the filter capsule.

## Fix (idiome sibling `MessageReactionsDetailView`)

Two accessibility modifiers on the capsule `Button`, mirroring the proven
sibling pattern and additionally surfacing the visible count:

```swift
.accessibilityLabel(count.map { "\(filter.label), \($0)" } ?? filter.label)
.accessibilityAddTraits(isSelected ? [.isSelected] : [])
```

- `.accessibilityLabel(…)` — reuses the already-localized `filter.label`
  (`message-detail.views.*`), appending the count when present via a neutral
  comma separator (standard VoiceOver idiom; **0 new i18n key**). Setting an
  explicit label on the Button also suppresses the decorative icon from the
  announcement, so VoiceOver reads e.g. « Read, 5, selected » instead of the
  symbol name plus label.
- `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` — the active
  filter now announces *"selected"*. The Button's own `.isButton` trait is
  untouched (accessibilityLabel/AddTraits do not remove it), so activation is
  unchanged.

## Rationale

The Views tab is a small, information-dense audit surface; a VoiceOver user must
be able to (a) know which filter is active and (b) hear the count that sighted
users see on each pill. The fix delivers both through native SwiftUI
accessibility APIs with **no** change to layout, color, animation, haptics, the
filter switch logic, or the Indigo/glass visual identity — and closes the
consistency gap with the two sibling detail views.

## i18n

- **0 new keys.** `filter.label` already resolves `message-detail.views.{sent,
  delivered,read,not-seen,listened,watched}`. The count is interpolated as a raw
  number; the `", "` separator is a neutral a11y join, not user-facing copy.

## Verification

- **Static review:** `.accessibilityLabel(_:)` (StringProtocol overload),
  `.accessibilityAddTraits(_:)`, and `Optional.map` are all iOS 13+/Swift stdlib
  — no availability guard needed (app floor iOS 16.0). `count` is the existing
  `Int?` local already computed at the top of `viewsFilterCapsule`.
- **No visual/logic change:** only two accessibility modifiers were appended to
  the Button; the visible pill (icon, label, count badge, fill, stroke),
  spring animation, haptic, and `viewsFilter` mutation are untouched.
  Accessibility modifiers don't affect hit-testing, so the sighted tap is
  unaffected.
- **No test churn:** no test references `viewsFilterCapsule` or
  `MessageViewsDetailView` internals (private helper).
- **Contention:** 0 open PRs touch `MessageViewsDetailView` (checked
  `list_pull_requests`, 18 open PRs — none reference it).
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  compile/VoiceOver run happens in CI. Confirm `iOS Tests` is green before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `MessageDetailSheet.viewsFilterCapsule` (~l.897) and `.reactionFilterCapsule`
  (~l.1587) — the same color-only filter-pill pattern in the ~1800-line
  aggregate sheet; each lacks `.isSelected`. Warrants its own focused iteration
  (large file).
- `OnboardingStepViews.languageCard` — selection uses fill + border weight and a
  `checkmark.circle.fill`, so not strictly color-only, but still lacks the
  `.isSelected` trait; softer 1.4.1 case for a later pass.

**Status: RESOLVED for `MessageViewsDetailView` filter-capsule selected-state +
count VoiceOver exposure. Do not re-flag.**
