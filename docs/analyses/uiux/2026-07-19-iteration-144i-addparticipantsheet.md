# Iteration 144i — AddParticipantSheet VoiceOver structure

- **Date**: 2026-07-19
- **Track**: iOS UI/UX (suffix `i`)
- **Working branch**: `claude/laughing-thompson-ich12b`
- **Base**: `main` HEAD `efedb69e4`
- **Scope**: 1 file, 0 logic changes, 1 inline i18n key (defaultValue-only, no catalog entry), 0 new test files

## Component

`apps/ios/Meeshy/Features/Main/Components/AddParticipantSheet.swift`

Bottom sheet for adding a member to a conversation: search field → results list.
The list has four states — loading (3 shimmer skeleton rows), search prompt
(query < 2 chars), empty results, and populated (`userRow` per match: avatar +
name/username block + `Membre` badge / `Ajouter` button / progress spinner).

## Context — Dynamic Type migration pool is dry

Before choosing this work I re-audited the whole `apps/ios/Meeshy` tree for
`.font(.system(size:))` call sites. Every remaining one is a **deliberately
frozen decorative/chrome glyph** already annotated under the 82i/84i/86i/87i
doctrine (close `xmark` in a 28pt tap frame, empty-state illustration glyphs,
avatar/badge glyphs in fixed frames, ambient background symbols inside a
`.accessibilityHidden(true)` decor tree). No genuine *text* call site remains to
migrate — the mechanical `.system(size:)` → `MeeshyFont.relative` pool is
exhausted. Per the tracking pointer this is the "passe state-of-the-art au
tarissement" case, so 144i is a native VoiceOver-structure pass, extending the
143i doctrine to a new screen.

## Findings

1. **`userRow` reads the member name twice.** `MeeshyAvatar` always carries its
   own `.accessibilityLabel(name)` (`MeeshyAvatar.swift:378/381`). The adjacent
   name/username `VStack` is already `.accessibilityElement(children: .combine)`
   → `"<name>, @<username>"`. VoiceOver therefore stops on the avatar
   (`"<name>"`) **and** on the combined block (`"<name>, @<username>"`) — the
   exact duplicate-name read fixed in 143i for `StoryExpiredContent`. The avatar
   here is purely presentational (no `moodEmoji` / `onMoodTap` / context menu),
   so hiding it removes no VoiceOver action.
2. **Loading skeleton interrupts VoiceOver with 3 empty rows.** While
   `isSearching`, the results area renders 3 `searchSkeletonRow` shimmer
   placeholders (decorative `Circle` + `RoundedRectangle` shapes, no text). A
   VoiceOver user swiping into the list during a search lands on 3 focusable but
   silent elements instead of hearing the loading state.

## Changes

- **`userRow`**: `.accessibilityHidden(true)` on the presentational
  `MeeshyAvatar` → the name is announced once (from the combined text block),
  not twice. Mirrors the 143i doctrine.
- **Loading skeleton**: `.accessibilityElement(children: .ignore)` +
  `.accessibilityLabel("Recherche en cours")` on the skeleton `VStack` → the
  shimmer collapses into a single spoken element that announces the loading
  state, instead of 3 empty swipe stops.

Both changes are purely additive view modifiers — no layout, no logic, no
branch changes. The visual rendering (sighted UX) is byte-for-byte identical.

## i18n

New inline key `participants.add.searching` (defaultValue `"Recherche en
cours"`, `bundle: .main`). Consistent with every sibling `participants.add.*`
key in this file, which are inline `String(localized:defaultValue:bundle:)` and
are **not** registered in `Meeshy/Localizable.xcstrings` (defaultValue is the
source of truth). No catalog edit required.

## Verification

- No logic, no branch changes — purely additive accessibility modifiers.
- `AddParticipantSheet` had no pre-existing test and exposes its search results
  through `@State private var searchResults`, which cannot be populated from a
  unit test — a `_ = view.body` smoke test would only exercise the empty-state
  path (not `userRow`), adding compile risk with near-zero coverage of the
  changed code. Given the change is behaviorally inert (VoiceOver-tree
  annotations only), no test file was added; CI's compile step validates it.
- Cannot run the iOS simulator on this Linux host; CI gate = `ios-tests`.

## Remaining trail (for 145i)

The `.system(size:)` migration pool is dry (all remaining call sites are frozen
glyphs). Continue the state-of-the-art VoiceOver-structure pass by propagating
the "presentational avatar → `.accessibilityHidden(true)`" fix to the other
user-row components that still double-read the name where the avatar is
non-interactive — e.g. `MemberManagementSection.memberRow` (avatar not hidden,
row not combined). Where the avatar **is** interactive (`ForwardPickerSheet`
mood tap), keep it exposed. `StoryViewerView+Content` remains parked (⚠️ i18n +
`@State private` cross-file). Avoid files under open iOS PRs.
