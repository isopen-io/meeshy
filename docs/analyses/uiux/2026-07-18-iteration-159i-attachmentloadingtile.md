# Iteration-159i — VoiceOver grouping for `AttachmentLoadingTile`

**Date:** 2026-07-18
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — composer / feed / story attachment preparation feedback
**File touched:** `apps/ios/Meeshy/Features/Main/Components/AttachmentLoadingTile.swift` (1 file, 0 logic, 0 new test)

## Component

`AttachmentLoadingTile` is the loading tile shown in the composer tray (and on
posts / stories) while an attachment is prepared — bytes loading, compression,
thumbnail extraction, ThumbHash. It renders identically across messages, posts
and stories so the preparation feedback is uniform. Lifecycle is driven by
`PreparingAttachment.stage` (`AttachmentPreparationStage`):
`.loading` / `.compressing` / `.thumbnailing` / `.hashing` / `.ready` / `.failed`.

## Finding (VoiceOver gap)

The tile was already sound on Dynamic Type (fonts frozen with doctrine
annotations — bounded by the fixed 56pt tile / 18pt cancel circle) and on i18n
(all labels localized). The remaining gap was **VoiceOver structure**:

1. **Fragmented reading.** The tile exposed its pieces as independent
   accessibility elements — the media-kind caption (`Text(label)`), the terse
   on-tile stage caption (`"Preview"`, `"Hash"`), and the `ProgressView`
   spinner ("In progress"). A VoiceOver user swept through disconnected
   fragments instead of hearing one coherent "Photo, Compressing".
2. **State never announced as a unit.** There was no single element whose
   *value* reflected the current stage, and no `.updatesFrequently` trait, so
   the loading → compressing → hashing progression was not surfaced.
3. **Failure conveyed by color + terse glyph only.** The `.failed` state read as
   a red badge with a decorative `exclamationmark.triangle.fill` (already
   `.accessibilityHidden`) and a terse "Erreur" — never announced as "Photo,
   failed to load" with the underlying reason.
4. **Cancel affordance below the HIG target.** The only way to cancel was the
   18×18pt corner button (well under the 44pt minimum touch target) — hard for
   VoiceOver users to locate and activate.

## Fix

Grouped the tile into a single accessibility element and modelled the stage as
its value:

- `.accessibilityElement(children: .ignore)` — collapses the fragmented
  children (kind caption, terse stage caption, spinner, decorative glyphs) into
  one element. The visible 18pt cancel button keeps its touch + haptics for
  sighted users; only its (now redundant) a11y is folded into the group.
- `.accessibilityLabel(kindLabel)` — the media kind ("Photo" / "Video" /
  "Audio" / "File" / "Location"), stable across stages (including `.failed`).
- `.accessibilityValue(accessibilityStageValue)` — the preparation stage as a
  *full* VoiceOver phrase ("Chargement en cours", "Compression en cours",
  "Génération de l'aperçu", "Finalisation", "Prêt", "Échec du chargement — …").
  The on-tile captions stay terse to fit 56pt; VoiceOver gets the unabbreviated
  wording. Result: "Photo, Compression en cours".
- `.accessibilityAddTraits(isPreparing ? .updatesFrequently : [])` — while the
  attachment is non-terminal, VoiceOver re-announces the value on refocus as the
  stage advances; the trait clears on `.ready` / `.failed`.
- `.accessibilityActions { … }` — exposes **Cancel** as a rotor action (only
  when `onCancel` is provided), so cancellation no longer depends on hitting the
  sub-44pt corner button.

Supporting refactor (no behavior change):
- Extracted `kindLabel` out of `label` so the media-kind wording is reused by
  both the on-tile fallback caption and the VoiceOver label (the visible `label`
  still overrides with the failure message when present).
- Added `accessibilityStageValue` and `isPreparing` computed helpers.
- Reused the existing `attachment.loading.cancel-a11y` key for the rotor action;
  added 6 new inline-`defaultValue` keys `attachment.loading.a11y-*` (same
  pattern as the rest of the file — no `.xcstrings` catalog edit required, French
  defaults ship inline).

## Rationale

Loading states are explicitly in the UX/accessibility review scope. Attachment
preparation is a transient, high-frequency surface every user hits when sending
media — a VoiceOver user previously got noise (spinner + terse fragments) and no
clear success/failure signal. The label/value split is the idiomatic Apple
pattern (label = what it is, value = its current state), and folding cancel into
a rotor action fixes a real HIG touch-target miss without changing the visual
design (Instant-App / brand identity preserved).

## Verification

- **Static review:** all modifiers are standard SwiftUI iOS 16.0+ APIs
  (`accessibilityElement`, `accessibilityLabel`/`Value`, `accessibilityAddTraits`,
  `accessibilityActions`) — app floor is iOS 16.0, no availability guard needed.
  `.accessibilityAddTraits(cond ? … : [])` and inline `String(localized:defaultValue:bundle:)`
  both have established precedent in the codebase.
- **No test churn:** no test references `AttachmentLoadingTile`; the three
  production call sites (`ConversationView`, `ConversationView+Composer`,
  `FeedView+Attachments`) pass `onCancel`/`size` unchanged.
- **CI gate:** `ios-tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm the `ios-tests` check is green on
  the PR before merge.

## Remaining improvements (future iterations)

- Consider a matching VoiceOver value on the *replaced* preview tiles once
  `.ready` transfers to the caller's regular preview (out of scope here — owned
  by the composer/feed preview components).
- `.font(.system(size:))` trailing backlog elsewhere (`ConversationView+Composer`,
  `CallView`, `FeedView`, `ReelsPlayerView`, `ConversationMediaGalleryView`,
  `AudioFullscreenView`, `StoryTrayView`, `FeedCommentsSheet`) — separate tiles.

**Status: RESOLVED for `AttachmentLoadingTile` VoiceOver structure.** Do not
re-open the frozen-font glyphs (doctrine 86i — bounded by fixed tile/circle).
