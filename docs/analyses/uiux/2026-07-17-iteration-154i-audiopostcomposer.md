# Iteration-154i — VoiceOver & content-selection pass for `AudioPostComposerView`

**Date**: 2026-07-17
**Track**: iOS (suffix `i`)
**Working branch**: `claude/laughing-thompson-jpq5us`
**Base**: `main` HEAD (post-#1995)
**File**: `apps/ios/Meeshy/Features/Main/Views/AudioPostComposerView.swift` (1 file, additive only)

## Context / freshness

`AudioPostComposerView` (the audio-post recording + on-device transcription composer)
is a ~746-line user-facing surface. Prior UI/UX iterations (44/45) only flagged its two
deliberate **dark-wash hex colors** (`0F0D19`, `13111C`) — a documented design decision,
intentionally left as-is. **No prior iteration touched its accessibility.** The swarm's
open PRs (140i→153i) all target other views, so this surface is uncontended.

Typography is already Dynamic-Type-ready: every text label uses semantic fonts
(`.subheadline`, `.caption`, `.callout`, `.footnote`, `.largeTitle`…), and the two
decorative hero glyphs already use `MeeshyFont.relative`. So there is **no `.font(.system(size:))`
migration to do** — the real gaps are VoiceOver semantics and content selection.

## Issues found & resolved

1. **Language chip selection was conveyed by color only** (selected chip = brand-gradient
   fill). VoiceOver had no way to announce which transcription language was active, and the
   bare visual label is a terse code (« FR »).
   → Added `.accessibilityLabel(fullDisplayName)` (localized full name, e.g. « Français »)
   + `.accessibilityAddTraits(.isSelected)` when active. New `fullDisplayName(for:)` helper
   mirrors the existing `AudioLanguagePickerView` capitalization idiom (0 new i18n keys —
   name comes from `Locale.localizedString`).

2. **Decorative state visualization not hidden** — the recording halo's `centerContent`
   (animated waveform / `checkmark.seal.fill` / `mic.fill` / spinner) is pure decoration;
   the spoken state is carried by the `durationLabel` text directly beneath it.
   → `.accessibilityHidden(true)` on `centerContent` (covers all four decorative states).

3. **Standalone decorative SF Symbols read by VoiceOver** — `globe` (selector header),
   `text.bubble.fill` (transcription header), `exclamationmark.triangle.fill` (error panel),
   `line.3.horizontal.decrease.circle.fill` (“Plus” button) each sit next to a text label
   that already carries the meaning.
   → `.accessibilityHidden(true)` on each.

4. **“Plus” button label is ambiguous in isolation** (VoiceOver announces just “Plus”).
   → `.accessibilityLabel("Plus de langues")` (1 inline `String(localized:defaultValue:)`,
   code-only, no xcstrings edit).

5. **Transcribed text was not selectable** — it is user-generated content the author may
   want to copy/quote before publishing.
   → `.textSelection(.enabled)` on the transcription body text (consistent with the
   content-selection theme of iterations 74i/86i/98i).

## Non-goals (deliberately untouched)

- Dark-wash hex colors (`0F0D19`, `13111C`) — documented design decision (iter 44/45).
- The record button already had a correct dynamic `.accessibilityLabel` (start/stop) — kept.
- Sliders/toggles in `AudioLanguagePickerView` are native `List`/`Toggle`/`.searchable`
  components — already VoiceOver-complete, not modified.

## Verification

- No `.font(.system(size:))` remained to migrate; typography already semantic.
- Additive view modifiers only — 0 logic change, 0 new test, 0 new xcstrings entry.
- Environment is Linux (no Xcode) → gate is CI `ios-tests` (per branch-tracking protocol).
- `fullDisplayName` reuses the exact `prefix(1).uppercased() + dropFirst()` idiom already
  compiling elsewhere in the same file (`AudioLanguagePickerView.listedLocales`).

## Status: RESOLVED (pending CI green)

Do not re-flag `AudioPostComposerView` for VoiceOver/selection: language-chip `.isSelected`
+ full-name label, decorative-glyph hiding, transcription `.textSelection`, and the
“Plus de langues” label are all solved here. Dark washes remain a design decision.
