# Analysis — Iteration-204i — VoiceProfileManageView empty-state dedup

**Date:** 2026-07-21 · **Scope:** iOS only · **Status:** ✅ Resolved

## Context

Continuation of the empty-state design-system consolidation thread
(178i `ShareLinksView`, 183i `profileposts`, 184i `TrackingLinksView`, and the
full-screen-with-action precedent `ConversationListView`). Swept for remaining
custom empty-state `VStack`s reimplementing the `EmptyStateView` primitive, skipping
all components already covered by open PRs (up to 203i).

## Finding

`VoiceProfileManageView.emptyState` reimplemented the shared `EmptyStateView`:
- Fixed `.system(size: 64)` gradient hero glyph (no Dynamic Type scaling).
- Bespoke full-width `RoundedRectangle(cornerRadius: 14)` CTA (vs standard accent `Capsule`).
- Manual `accessibilityHidden` glyph + no combined VoiceOver element.
- No spring appear animation.

This is the same class of divergence resolved for `ShareLinksView`/`TrackingLinksView`,
except this is a **full-screen empty with a primary action** — so the correct variant is
non-compact `EmptyStateView(icon:title:subtitle:actionLabel:accentColor:onAction:)`, matching
`ConversationListView`.

## Resolution (completed 204i)

Replaced the hand-rolled `VStack` (~48 lines) with a single `EmptyStateView(...)` call:
- `icon: "person.wave.2.fill"`, `title`/`subtitle`/`actionLabel` reuse the **3 existing i18n
  keys** (`voice.profile.empty.title` / `.description` / `voice.profile.create`) → **0 new keys**.
- `accentColor: accentColor` (already a `String` hex in scope).
- `onAction: { showWizard = true }` → opens `VoiceProfileWizardView` (unchanged).

### Rationale

- **Dedup** — one shared component instead of a bespoke reimplementation.
- **Dynamic Type** — hero glyph now scales instead of fixed 64pt.
- **Consistency** — standard `Capsule` accent CTA + spring animation + combined VoiceOver,
  identical to every other empty state.
- **HIG** — single clear primary action, native breathing layout.

## Verification status

- 1 file changed; `header` / `loadingView` / `profileContent` / ViewModel / navigation untouched.
- 0 logic / 0 network / 0 new i18n key / 0 new test.
- `theme` / `Color(hex:)` remain referenced (`header` / `loadingView`) — no dead code.
- Gate: CI **iOS Tests** (mirrors `ConversationListView` full-screen-with-action adoption).

## Remaining improvements (future iterations)

- The `voice.profile.deleteAlert` uses native `.alert` — already HIG-compliant, no action.
- `profileContent` status/info cards: candidate for a future card-primitive dedup review
  (out of scope here; check swarm collisions first).

## ⚠️ Do NOT re-flag

`VoiceProfileManageView.emptyState` — native `EmptyStateView` adoption soldered in 204i.
Hero glyph is now the shared primitive's scaling glyph (supersedes the local "doctrine 84i
fixed hero" note, exactly as 184i did for `TrackingLinksView`).
