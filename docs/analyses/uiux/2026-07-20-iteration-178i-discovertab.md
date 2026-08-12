# Iteration-178i — VoiceOver structure for `DiscoverTab`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — Contacts › Discover tab (invite / find-on-Meeshy / user search)
**File touched:** `apps/ios/Meeshy/Features/Contacts/DiscoverTab.swift` (1 file, 0 logic, 0 new test, 0 new i18n key)

## Component

`DiscoverTab` is the "Discover" tab of the Contacts hub. It stacks three
sections in a scroll view:
- **Invite** — email invite card, SMS invite card, "find my contacts on Meeshy" button.
- **Contact matches** — people already on Meeshy that match the device address book.
- **Search** — a live user search bar with results, a loading spinner, and a
  no-results empty state.

Dynamic Type was already handled (iteration 19i migrated the empty-state glyph
to the scalable `.font(.system(.title))`; every other string uses semantic
fonts). The invite-section buttons already carried `.accessibilityLabel`s.
VoiceOver of the **search + result rows** had never been audited.

## Findings

Four real VoiceOver gaps, all in the search/results path:

1. **Icon-only search clear button with no label.** The `xmark.circle.fill`
   button that clears the query (`searchBar`) had no `.accessibilityLabel` —
   VoiceOver announced only "button", giving no hint of its purpose (HIG: every
   icon-only control needs a label). Every sibling search field in the app
   (`AddParticipantSheet`, `LocationPickerView`, `MessageForwardDetailView`,
   `ConversationView+MessageRow`) already labels this exact control.

2. **Search-in-progress spinner was silent.** The `ProgressView` shown while a
   search runs exposed nothing to VoiceOver — no announcement that a search was
   in flight. `GlobalSearchView` already labels its equivalent spinner
   "Recherche en cours".

3. **No-results empty state read as fragments.** The `magnifyingglass` glyph +
   "Aucun utilisateur trouvé" text swept as two disconnected elements, the
   decorative glyph included.

4. **Profile-opening rows not perceivable as actionable.** Both
   `contactMatchRow` and `searchResultRow` open the user profile via an
   `.onTapGesture` on the name/username `VStack`. A bare `.onTapGesture` on a
   `Text` stack carries **no** accessibility trait — VoiceOver saw inert text,
   never a control, so the profile could not be opened with VoiceOver on that
   target, and the tappable region was ambiguous.

## Fix

Applied the canonical Apple patterns, reusing existing localization keys (0 new
keys):

- **Clear button** → `.accessibilityLabel("common.clear-search" /
  "Effacer la recherche")` (same key already used by three sibling search fields).
- **Search spinner** → `.accessibilityElement(children: .ignore)` +
  `.accessibilityLabel("accessibility.searching" / "Recherche en cours")`
  (same key `GlobalSearchView` uses).
- **Empty state** → `.accessibilityHidden(true)` on the `magnifyingglass` glyph
  + `.accessibilityElement(children: .combine)` on the container → one clean
  "Aucun utilisateur trouvé" stop.
- **Profile rows** (both `contactMatchRow` and `searchResultRow`) →
  `.contentShape(Rectangle())` so the whole name/username block is the hit
  target, then `.accessibilityElement(children: .combine)` +
  `.accessibilityAddTraits(.isButton)` +
  `.accessibilityHint("bubble.avatar.viewProfile" / "Voir le profil")`. VoiceOver
  now reads "{name}, @{username}, button — Voir le profil" and activation
  triggers the existing tap gesture. The sibling `ConnectionActionView`
  (add-friend / message) stays a separate, independently-actionable element —
  grouping is per-subelement, not whole-row, precisely because the row carries
  two distinct actions.

## Rationale

Search, discoverability and "never rely only on color/icon" are explicitly in
the UX + accessibility review scope. Discover is a primary acquisition surface
(inviting and finding people); a VoiceOver user previously could not clear the
search, was told nothing while it loaded, heard the empty state as noise, and
could not open a profile from a result. All four fixes are the established
label/trait/hint idioms already used verbatim elsewhere in the codebase, reuse
existing keys, and change no visual design (Indigo brand identity and layout
untouched).

## Verification

- **Static review:** all modifiers (`accessibilityLabel`, `accessibilityElement`,
  `accessibilityAddTraits`, `accessibilityHidden`, `accessibilityHint`,
  `contentShape`) are standard SwiftUI iOS 16.0+ APIs — app floor is iOS 16.0,
  no availability guard needed. The three keys
  (`common.clear-search`, `accessibility.searching`, `bubble.avatar.viewProfile`)
  each already ship with the same inline `defaultValue` at other call sites — 0
  new keys, 0 `.xcstrings` catalog edit.
- **No test churn:** no test references `DiscoverTab` (grep across `MeeshyTests`
  / `MeeshyUITests` = 0). No logic, no ViewModel, no networking touched.
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green on the PR
  before merge.

## Remaining improvements (future iterations)

- `contactMatchRow` / `searchResultRow` also open the profile via a tap on the
  `MeeshyAvatar`. `MeeshyAvatar` carries its own accessibility; the avatar's
  profile-open remains an app-wide pattern left as-is here to keep the change
  minimal.
- `SMSComposerView` / email invite are `UIViewControllerRepresentable` system
  composers — already fully accessible.
- Contacts sibling tabs still open for audit: `CallsTab`, `RequestsTab`,
  `BlockedTab` (VoiceOver of their rows / empty states).

**Status: RESOLVED for `DiscoverTab` VoiceOver structure (search clear, loading,
empty state, profile-open rows).**
