# Iteration-168i — Localization + VoiceOver for `StoryTrayView`

**Date:** 2026-07-19
**Scope:** iOS only
**Area:** Localization (i18n) + Accessibility (VoiceOver) — top-of-feed story tray
**File touched:** `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift` (1 file, 0 logic, 0 new test)

## Component

`StoryTrayView` renders the horizontal story tray at the top of the feed:
- `StoryRingCell` — one other-user story group (avatar ring + username), shared
  by the full-size trail and the compact pinned mini-trail.
- `MyStoryButton` — the connected user's avatar with add-story `+` badge,
  mood placeholder, and an in-place **upload overlay** (`StoryUploadOverlay`)
  shown while a story publishes.

Each avatar exposes a long-press **context menu** via `AvatarContextMenuItem`.

## Findings

The file was already sound on Dynamic Type (all visible text uses
`MeeshyFont.relative(…)`; the handful of fixed `.system(size:)` glyphs sit in
fixed-diameter circles, frozen per doctrine 82i/86i, with in-code comments).
Two gaps remained:

1. **Six hardcoded, unlocalized French context-menu labels + a `"Moi"`
   fallback.** Every other `AvatarContextMenuItem(label:)` call site in the
   codebase wraps its label in `String(localized:defaultValue:)`
   (`FeedCommentsSheet`, `FeedPostCard`, `PostDetailView`,
   `ThemedConversationRow`, `ConversationView+Header`…). `StoryTrayView` alone
   shipped raw literals:
   - `"Voir les stories"`, `"Voir le profil"` (`StoryRingCell`),
   - `"Voir ma story"`, `"Gérer mes stories"`, `"Ajouter une story"`,
     `"Changer mon mood"` (`MyStoryButton`),
   - `"Moi"` — the avatar `name:` fallback (feeds the monogram + VoiceOver
     name when both `displayName` and `username` are nil).

2. **Zero accessibility on `StoryUploadOverlay`.** The story-upload indicator
   conveyed the 0→100 % progression **only** through the gradient trim
   geometry, and the failure state **only** through a red ring +
   `exclamationmark.triangle` glyph. There was no `.accessibilityElement`,
   no label/value, and no `.updatesFrequently` trait — so VoiceOver swept a
   bare `"42%"` fragment with no upload context, and a failed upload was
   completely silent (color/icon-only, violating HIG "never rely only on
   color").

## Changes

### i18n (7 labels, 4 new code-only keys, 3 reused)
- `"Voir les stories"` → `story.tray.menu.viewStories` (new)
- `"Voir le profil"` → `story.tray.menu.viewProfile` (new)
- `"Voir ma story"` → `story.tray.menu.viewMyStory` (new)
- `"Gérer mes stories"` → `story.tray.menu.manageStories` (new)
- `"Ajouter une story"` → **reuse** `story.tray.addStory` (already in catalog,
  same string as the `+` badge label at line 494)
- `"Changer mon mood"` → **reuse** `story.tray.a11y.changeMood` (already in
  catalog, same string as the mood placeholder label)
- `"Moi"` fallback → **reuse** `story.tray.me` (already in catalog, same string
  as the "Moi" caption under the avatar)

All via `String(localized:defaultValue:bundle:.main)` — Xcode auto-extraction,
**0 manual `.xcstrings` edit** (parité 163i/164i). Renders identically in `fr`;
`en`/RTL now resolve through the String Catalog like every other menu.

### a11y — `StoryUploadOverlay`
Single combined element exposing upload state without color:
- `.accessibilityElement(children: .ignore)`
- `.accessibilityLabel` — state-aware: `story.tray.upload.a11y.uploading`
  ("Publication de la story") vs `story.tray.upload.a11y.failed`
  ("Échec de la publication de la story") (2 new keys)
- `.accessibilityValue("\(progressPercent)%")` while uploading — VoiceOver now
  reads e.g. "Publication de la story, 42 percent"
- `.accessibilityAddTraits(.updatesFrequently)` while uploading so the live
  progression is re-read; `.isButton` when failed (double-tap retries via the
  existing `onTapGesture`)
- `.accessibilityHint(story.tray.upload.a11y.retryHint)` when failed (1 new key)

`progressPercent` uses `.rounded()` (parity with the visible
`Int(upload.progress * 100)` label).

## Non-goals / preserved

- Upload paging/retry/cancel logic, the context-menu retry/cancel actions, the
  gradient ring animation, and the palette are **untouched**.
- Fixed `.system(size:)` glyphs (mood `💭` 20pt in 32×32 circle, `+` 19pt in
  34×34, failure `exclamationmark.triangle` 14pt in 50×50, upload `%` 12pt in
  50×50) stay **frozen** — decorative glyphs in fixed-diameter circles that
  would overflow if scaled (doctrine 82i/86i); their labels are carried by the
  surrounding buttons / the new overlay element.

## Verification

- 1 file, 0 logic, 0 new test. 4 menu + 3 a11y = **7 new code-only i18n keys**,
  3 reused keys, 0 `.xcstrings` edit.
- `StoryTrayMyStoryTapGuardTests` / `MyStoriesCreateStoryGuardTests` reference
  `"Voir ma story"` only in **comments** (not assertions) → no regression.
- Gate = CI `iOS Tests` (compile + phased suites). Local build N/A (Linux env,
  iOS toolchain is macOS-only — parity with all prior `i` iterations).

## Status

**RESOLVED.** `StoryTrayView` context-menu i18n and `StoryUploadOverlay`
VoiceOver are complete. **Do not re-flag** these — the 4 fixed glyphs are
frozen by design (doctrine 82i/86i), Dynamic Type already covered.
