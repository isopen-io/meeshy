# Iteration-208i — VoiceOver label for ConversationView error-banner dismiss

**Date:** 2026-07-21
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — conversation error banner
**File touched:** `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (1 file, 0 logic, 0 test, 0 catalog edit)

## Component

The **error banner** in `ConversationView` (the primary chat screen) is the
transient overlay shown when `viewModel.error != nil` — a warning-triangle
glyph + the error message + a dismiss button, over `.ultraThinMaterial`. It is
the only affordance a user has to clear a conversation-level error (send
failure, load failure, etc.).

## Finding

Two VoiceOver deficits in the banner `HStack` (`ConversationView.swift:1237`),
from most to least severe:

1. **Dismiss button has no accessibility label (WCAG 4.1.2).** The `Button`
   (line 1244) sets `viewModel.error = nil`, but its label is built entirely
   from a bare `Image(systemName: "xmark.circle.fill")` with **no**
   `.accessibilityLabel`. VoiceOver fell back to the SF-Symbol name
   ("XMark Circle Fill, button"), giving a blind user no indication that the
   control dismisses the error — the sole dismissal path was effectively
   unusable.

2. **Decorative warning glyph read aloud.** The leading
   `exclamationmark.triangle.fill` (line 1238) carried no `.accessibilityHidden`,
   so VoiceOver announced "exclamationmark triangle fill" before the error text
   — noise, since the adjacent `Text(error)` already carries the meaning.

## Fix

1. **Dismiss button** → `.accessibilityLabel(String(localized: "common.close",
   defaultValue: "Fermer", bundle: .main))`, reusing the app-wide close SSOT key
   already applied to 15+ dismiss controls (`PostTranslationSheet:67`,
   `MagicLinkView:69`, `AudioFullscreenView:477`, `VoiceProfileManageView:71`, …).
   **0 new i18n key.**
2. **Warning glyph** → `.accessibilityHidden(true)` (decorative; the error
   `Text` conveys the message), matching the shipped `iconBadge` /
   decorative-glyph doctrine (186i).

**No `.accessibilityElement(children: .combine)`** on the `HStack`: combining
would absorb the `Button` into a single element and strip its native
`.isButton` trait / independent actionability (doctrine 177i). The `Text(error)`
is read on its own; the button stays a discrete, correctly-labeled VoiceOver
stop.

## Rationale

Clearing an error is a first-class recovery action; its control must be a
properly-named VoiceOver target. The change is purely the accessibility tree
(one label, one decorative-hide) — banner layout, colors, `.ultraThinMaterial`,
transition, and the `viewModel.error = nil` behavior are untouched.

## Verification

- **Static review:** `.accessibilityLabel` / `.accessibilityHidden` are standard
  SwiftUI iOS 14/16+ (app floor iOS 16.0 → no availability guard).
- **No visual/logic change:** only two accessibility modifiers added; the
  `Group`/`VStack`/`HStack` layout, spacers, padding, material, transition, and
  dismiss action are unchanged.
- **`common.close` reuse:** widely-shipped key (grep: 15+ `common.close` sites),
  so **0 `.xcstrings` edit**, consistent with every other dismiss control.
- **No test churn:** no test references this banner (the ViewModel `error`
  property is untouched).
- **0 contention:** no open iOS PR modifies `ConversationView.swift`
  (`search_pull_requests … ConversationView in:title` → 0; the file is absent
  from the enumerated open-PR changed-file sets).
- **CI gate:** `iOS Tests` (macOS runner) — authored in a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green before merge.

## Remaining improvements (future iterations, surfaced during scan)

- The Explore sweep confirmed the `Features/` icon-button surface is otherwise
  saturated: `CallBubbleView` (mute/speaker/hangup), `ShareLinksView` /
  `TrackingLinksView` copy buttons, `CommunityLinksView` / `LinksHubView` /
  `GlobalSearchView` (intentionally `.accessibilityHidden` + 183i doctrine,
  re-exposed via row `.accessibilityAction`), `MessageOverlayMenu` audio skip,
  `ConversationLockSheet` backspace — all already labeled or doctrine-frozen.
- `UniversalComposerBar.swift:867` `toolbarButton` matches the unlabeled pattern
  but is **dead code** (zero callers) — no user reaches it; not worth a label.
- `MemberManagementSection.emptyState` handmade `VStack` could dedup to
  `EmptyStateView(compact:)`, but that primitive expands to `maxHeight:.infinity`
  (Spacers), risking layout change in the embedded section — deferred pending a
  Swift build to confirm sizing.

**Status: RESOLVED for `ConversationView` error-banner VoiceOver (dismiss-button
label + decorative-glyph hide).**
