# Iteration-178i — VoiceOver structure for `BlockedUsersView`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — Safety / Blocked-users management
**File touched:** `apps/ios/Meeshy/Features/Main/Views/BlockedUsersView.swift`
(1 file, 0 logic, 0 new test)

## Component

`BlockedUsersView` is the Settings → Safety screen listing the users the current
account has blocked. It shows a custom header (back button + centered title), a
4-row shimmer skeleton while loading, an `EmptyStateView` when the list is empty,
and otherwise a `List` of rows — each an avatar + name + `@username` + an inline
"Débloquer" capsule button, with a trailing swipe action mirroring the button.
An `.alert` confirms the destructive unblock.

## Findings

Typography was already fully `MeeshyFont.relative(…)` (Dynamic Type covered), the
unblock button already carried `.accessibilityLabel("Débloquer {name}")`, and the
empty state already delegates to the accessible `EmptyStateView`
(`.accessibilityElement(children: .combine)` + label). Three VoiceOver gaps
remained:

1. **Loading skeleton was VoiceOver noise.** `loadingState` rendered four
   decorative shimmer rows with no accessibility treatment. VoiceOver swept them
   as empty fragments and there was no audible "loading" signal — the progress
   was conveyed only by the shimmer animation (a visual-only channel).
   (`SkeletonStoryThumb.swift:45` already establishes the "decorative skeleton →
   hidden from VoiceOver" precedent.)

2. **List rows were not grouped.** Each `blockedUserRow` exposed the
   `MeeshyAvatar`, the name, and the `@username` as *separate* VoiceOver stops —
   3–4 focus stops per row before reaching the actionable unblock button, with
   the avatar redundantly announcing the name already read below it.

3. **Header title was not a rotor heading.** The screen title
   "Utilisateurs bloqués" lacked `.isHeader`, so VoiceOver's heading rotor
   skipped it. (`ReportUserView.swift:41`, `PrivacyPolicyView.swift:85` set the
   precedent for screen-title headers.)

## Fix

Pure VoiceOver-structure pass, no visual or behavioral change:

- **Loading:** `loadingState` → `.accessibilityElement(children: .ignore)` +
  `.accessibilityLabel(…)` — collapses the four shimmer rows into one element
  that announces "Chargement en cours". One new inline-`defaultValue` key
  `blocked.users.loading.a11y` (French default ships inline, no `.xcstrings`
  edit — same doctrine as the rest of the file's `blocked.users.*` keys; wording
  aligned with the existing `attachment.loading.a11y-loading`).
- **Row:** `MeeshyAvatar` → `.accessibilityHidden(true)` (the name is read
  textually just beside it); the name/`@username` `VStack` →
  `.accessibilityElement(children: .combine)` → one identity stop
  "Name @username". The unblock `Button` keeps its existing per-user
  `.accessibilityLabel`, so each row is now two clean stops: identity + action.
- **Header:** title `Text` → `.accessibilityAddTraits(.isHeader)`.

Unblock stays reachable for VoiceOver users via the visible in-row button (in
addition to the trailing swipe action), so no custom `.accessibilityAction` is
required. Empty state untouched (already accessible).

## Rationale

Loading states and "never rely only on color/animation to convey meaning" are
explicitly in the accessibility review scope. Blocking is a safety mechanism a
vulnerable user relies on; a VoiceOver user previously heard shimmer noise with
no loading cue, then 3–4 disjoint stops per blocked contact. Folding the
skeleton into one announced element, de-duplicating the avatar, and combining the
identity text makes the screen navigable without touching the Indigo visual
design. The label/combine/`.isHeader` idioms are the canonical Apple patterns and
match sibling iterations (144i/155i row grouping, 149i header `.isHeader`).

## Verification

- **Static review:** all modifiers are standard SwiftUI iOS 16.0+ APIs
  (`accessibilityElement`, `accessibilityLabel`, `accessibilityHidden`,
  `accessibilityAddTraits(.isHeader)`). App floor is iOS 16.0 — no availability
  guard needed. Interpolated `String(localized:defaultValue:bundle:)` and
  `.isHeader` on titles both have established precedent in-repo.
- **No test churn:** no test references `BlockedUsersView` (grep across
  `MeeshyTests` / `MeeshyUITests` / `MeeshySDKTests` = 0). No production call-site
  signature changed.
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green on the PR
  before merge.

## Remaining improvements (future iterations)

- The header back button (`chevron.left` + "Retour") is auto-combined by the
  enclosing `Button` and already announces "Retour" — left unchanged; an explicit
  `.accessibilityLabel(common.back)` is optional parity, not a gap.
- `PostTranslationSheet`, `PeopleDiscoveryView`, `AffiliateCreateView`,
  `CreateTrackingLinkView`, `StatusComposerView` surfaced during this scan as
  fresh VoiceOver candidates (verify swarm collision via `list_pull_requests`
  before picking one).

**Status: RESOLVED for `BlockedUsersView` VoiceOver structure.**
