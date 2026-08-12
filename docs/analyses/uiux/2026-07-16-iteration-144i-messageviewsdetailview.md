# Iteration 144i — MessageViewsDetailView state-icon Dynamic Type + VoiceOver

- **Date**: 2026-07-16
- **Track**: iOS UI/UX (suffix `i`)
- **Working branch**: `claude/laughing-thompson-yv7ym8`
- **Base**: `main` HEAD `b92c96b`
- **Scope**: 1 file, 0 logic changes, 0 new i18n keys, 0 new test files

## Component

`apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsDetailView.swift`

The message-detail "views/reads/deliveries" panel. Two shared helpers render the
non-happy states surfaced inside each sub-filter (delivered / read / received /
audio / video):

- `emptyStateView(icon:text:accent:)` — a centred SF Symbol + footnote caption
  ("Personne n'a lu ce message", "Aucun audio attaché", …).
- `retryableErrorView(accent:)` — a `wifi.slash` glyph + error caption + Retry
  button, shown when the read-status fetch fails.

## Findings

1. **State icons frozen at a fixed 28pt.** Both helpers used
   `.font(.system(size: 28, weight: .light))` on their `Image(systemName:)`. The
   captions beneath them already use the semantic `.footnote` style and scale
   with Dynamic Type — so at large accessibility sizes the caption grew while the
   icon stayed 28pt, breaking the icon/caption proportion. 28pt is **below** the
   40pt hero-glyph freeze threshold (84i convention), so these are migration
   candidates, not freezes; neither sits in a fixed-height frame
   (`.frame(maxWidth: .infinity)` + `.padding(.vertical, 30)` only).
2. **Decorative icons exposed to VoiceOver.** Neither state icon carried an
   accessibility treatment, so VoiceOver announced an unlabeled "image" before
   the caption. The meaning is fully carried by the caption (and, for the error
   state, the Retry button), so the icons are purely decorative.

## Changes

- **`emptyStateView`**: icon `.font(.system(size: 28, weight: .light))` →
  `MeeshyFont.relative(28, weight: .light)` (scales with the caption) +
  `.accessibilityHidden(true)` on the decorative icon +
  `.accessibilityElement(children: .combine)` on the `VStack` → the empty state
  reads as the single caption instead of "image" + text.
- **`retryableErrorView`**: same icon migration to `MeeshyFont.relative(28,
  weight: .light)` + `.accessibilityHidden(true)` on the decorative `wifi.slash`.
  **Not** combined into one element — the Retry `Button` must stay independently
  focusable for VoiceOver, so caption and button remain separate stops.

Both call sites now resolve `MeeshyFont` through the file's existing
`import MeeshyUI` (no new import). No branch/logic changes — purely additive view
modifiers + a mechanical font swap.

## Dynamic Type — migrate vs freeze

The two `.font(.system(size:))` sites are **28pt state icons < 40pt** → migrated
to `MeeshyFont.relative` (they scale). This is distinct from:
- the **≥40pt hero-glyph freeze** (84i / 143i: reaction emoji 64pt, comment
  bubble 56pt) — kept fixed; and
- **Swift Charts axis labels** (`StatsTimelineChart`, `ConversationDashboardView`:
  9pt) — a documented "kept compact inside the fixed-height chart" exception, NOT
  migrated. `StatsTimelineChart` is the only chart whose two 9pt axis labels are
  still un-annotated; annotate (not migrate) them in a future pass for parity
  with `ConversationDashboardView`.

**⚠️ `MessageViewsDetailView` state icons SOLDÉ**: do not re-open the 2 `.system`
sites — migrated + hidden. The file's remaining text already uses semantic
relative fonts.

## Verification

- No logic, no branch changes — additive modifiers + one mechanical font swap
  mirroring the 143i template (which passed the `ios-tests` gate).
- `grep` confirms **0** `.font(.system(size:))` remaining in the file, **2**
  `MeeshyFont.relative`, **2** `.accessibilityHidden(true)`.
- No test references `MessageViewsDetailView` / `emptyStateView` /
  `retryableErrorView`, so no test regression surface.
- Cannot run the iOS simulator on this Linux host; CI gate = `ios-tests`.

## Remaining trail (for 145i)

- **Localization debt (dedicated i18n iteration)**: `emptyStateView` is called
  with **hardcoded French** captions at 5 sites (lines ~467/503/540/586/610:
  "Aucune confirmation de distribution", "Personne n'a lu ce message", "Tout le
  monde a reçu le message", "Aucun audio attaché", "Aucune vidéo attachée"),
  whereas `retryableErrorView` already uses `String(localized:)`. Wrapping these
  5 captions in localized keys (+ FR/EN values) is a separate, larger change
  (new i18n keys) — keep it out of the tiny Dynamic-Type/a11y cadence.
- **`StatsTimelineChart`**: annotate (do NOT migrate) its 2 remaining 9pt axis
  labels as a Charts Dynamic-Type exception, mirroring `ConversationDashboardView`.
- **Freeze/annotate case** `ConversationBackgroundComponents`: the 2 `.system(16)`
  glyphs (`person.fill`, `antenna.radiowaves…`) are ambient animated-background
  decoration constrained inside fixed 40/35pt circles → keep fixed +
  `.accessibilityHidden(true)`, do not migrate.
- Then the 2/1-`.system` tail (`BubbleStandardLayout` 2 — hot leaf path, careful),
  or `StoryViewerView+Content` (⚠️ i18n + `@State private` cross-file).
- Avoid files touched by open iOS PRs (#1966 ThemedBackButton, #1968 MyStoriesView,
  #1970 FriendRequestListView, #1972 StoryExpiredContent).
