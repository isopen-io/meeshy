# Iteration-178i — Localization + VoiceOver for `ConversationView+ScrollIndicators`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Localization (i18n) + Accessibility (VoiceOver) + Single Source of Truth
**File touched:** `apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift`
(1 file, 0 logic, 0 new test)

## Component

`ConversationView+ScrollIndicators.swift` is the `ConversationView` extension
that owns the **scroll-to-bottom button** shown in every conversation. It feeds
`ConversationScrollControlsView` (the SDK render component) a rich preview of the
last unread message — an attachment-type label, a thumbnail, media detail — and
supplies the button's VoiceOver `accessibilityLabel`. Three computed `String`
properties held hardcoded, unlocalized **French** literals:

- `scrollToBottomAccessibilityLabel` (VoiceOver) — L66/L69/L71
- `unreadAttachmentTypeLabel` (visible in the button preview) — L77-L81
- `typingLabel` (feeds the VoiceOver label) — L125-L127

## Findings

Every user-facing string in this file bypassed the codebase's inline
`String(localized:defaultValue:bundle:)` idiom:

1. **VoiceOver label was raw French.** `"… messages non lus, defiler vers le
   bas"`, `"\(typingLabel), defiler vers le bas"`, `"Defiler vers le bas"` — a
   VoiceOver user on any non-French locale heard untranslated French, and the
   verb was even mis-accented (`defiler` → should be `défiler`).

2. **Visible attachment-type label was raw French AND inconsistent with the
   composer.** The button preview showed `"Photo"/"Video"/"Audio"/"Fichier"/
   "Position"`. The composer's own attachment labels
   (`ConversationView+Composer.swift:1031` `labelForAttachment`) already resolve
   the *same* concept through the shared keys `attachment.label.{photo,video,
   audio,file,location}` → `"Photo"/"Video"/"Audio"/"File"/"Location"`. So the
   same attachment rendered `"Fichier"` in the scroll button but `"File"` in the
   composer — a Single-Source-of-Truth violation, not just a localization gap.

3. **Typing label duplicated the canonical typing string, hardcoded.**
   `typingLabel` re-implemented the 1/2/many typing phrasing with raw French
   (`"\(name) écrit"`, `"… et … écrivent"`, `"N personnes écrivent"`), while the
   canonical typing bubble (`MessageListViewController.swift:1273`) already
   resolves the identical cases through the fully-translated catalog keys
   `typing.named` / `typing.double` / `typing.several` (de/en/es/fr/pt-BR).

## Fix

Maximized **reuse of existing keys** over minting new ones:

- **`unreadAttachmentTypeLabel`** → reuses `attachment.label.{photo,video,audio,
  file,location}` with the *identical* inline `defaultValue`s as the composer
  (no String-Catalog conflict; same key + same default). This both localizes the
  label and makes the scroll-button preview consistent with the composer.
- **`typingLabel`** → reuses `typing.named` / `typing.double` / `typing.several`
  (already 5-language-translated in `Localizable.xcstrings`), mirroring
  `MessageListViewController`'s typing logic exactly. The 3-plus case now reads
  the canonical "Several people are typing" instead of an ad-hoc count phrase.
- **`scrollToBottomAccessibilityLabel`** → two new inline-`defaultValue` keys
  with French defaults (file-family doctrine — no `.xcstrings` edit, Xcode
  auto-extracts): `conversation.scroll-to-bottom.a11y`
  (`"Défiler vers le bas"`, corrected accent) and
  `conversation.scroll-to-bottom.a11y-unread` (`"%d messages non lus"`, a
  `String(format:)` count phrase). The state prefix and the action are composed
  with a `", "` joiner (VoiceOver reads it as a pause).

Net: **2 new keys**, **8 keys reused** (5 attachment + 3 typing). Zero logic,
zero visual change to layout, zero behavior change to the button's tap/audio
handlers.

## Rationale

The scroll-to-bottom button is a high-traffic surface hit in every conversation,
and it was the file's entire content that leaked raw French — both to the screen
(attachment preview) and to VoiceOver. Reusing the composer's and typing bubble's
existing keys is the stronger move than local re-localization: it collapses two
Single-Source-of-Truth violations (the same attachment/typing concept rendered
two different ways) while getting the strings translated for free in the
languages the reused keys already cover.

## Verification

- **Static review:** all modifiers/APIs are standard (`String(localized:
  defaultValue:bundle:)`, `String(format:)`) with established precedent across
  the codebase; app floor iOS 16.0, no availability guard needed. Reused keys
  confirmed present: `typing.*` exist in `Localizable.xcstrings` with fr/en/es/
  de/pt-BR translations; `attachment.label.*` are auto-extracted inline keys
  already used by `ConversationView+Composer.swift` with identical defaults.
- **No test churn:** `ConversationScrollControlsViewTests` (SDK) asserts on
  `ConversationScrollControlsView.typingLabel(for:)` — a *different*, in-button
  visual label with no verb suffix — not on this extension's `typingLabel`
  (which now feeds only the VoiceOver string). No test references
  `scrollToBottomAccessibilityLabel` / `unreadAttachmentTypeLabel`. Grep across
  `MeeshyTests` / `MeeshyUITests` / `MeeshySDKTests` = 0 hits on the touched
  members.
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green before merge.

## Remaining improvements (future iterations)

- `ConversationView+Composer.swift`'s `attachment.label.*` inline defaults are
  English while `Localizable.xcstrings` `sourceLanguage` is `fr` — a latent
  base-language inconsistency in the *composer* (out of scope here; flagged for a
  future i18n-audit iteration).
- `unreadAttachmentDetail` builds a `w×h` / duration / size string that is
  already locale-aware (uses `fileSizeFormatted` / `durationFormatted`) — no
  change needed.

**Status: RESOLVED for `ConversationView+ScrollIndicators` localization + VoiceOver.**
