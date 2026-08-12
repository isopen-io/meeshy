# Plan — Iteration-178i — VoiceOver structure for `BlockedUsersView`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — Safety / Blocked-users management screen
**Target file:** `apps/ios/Meeshy/Features/Main/Views/BlockedUsersView.swift`

## Why this surface
Fresh surface (0 prior analysis, 0 in-flight PR — swarm 140i→177i verified via
`list_pull_requests`). Number **178i** chosen strictly > highest in flight (177i).
A safety-critical settings screen (list of blocked users + unblock) with clear,
well-bounded VoiceOver gaps. Typography already 100% `MeeshyFont.relative(…)` →
**no Dynamic Type migration needed**; this is a pure VoiceOver-structure pass.

## Gaps identified
1. **Loading skeleton is VoiceOver noise.** `loadingState` renders 4 shimmer
   rows with no accessibility treatment → VoiceOver sweeps empty decorative
   fragments, no "loading" signal. (Precedent: `SkeletonStoryThumb` hides
   decorative skeletons.)
2. **List rows not grouped.** Each `blockedUserRow` exposes the `MeeshyAvatar`,
   the name, and the `@username` as separate VoiceOver stops (3–4 per row before
   reaching the unblock button).
3. **Header title lacks `.isHeader`.** The screen title "Utilisateurs bloqués"
   is not a rotor heading. (Precedent: `ReportUserView`, `PrivacyPolicyView`.)

## Fix (single file, 0 logic, 0 test)
- Loading: `loadingState` → `.accessibilityElement(children: .ignore)` +
  `.accessibilityLabel("Chargement en cours")` (1 new inline-`defaultValue` key
  `blocked.users.loading.a11y`, wording aligned with `attachment.loading.a11y-loading`).
- Row: `MeeshyAvatar` → `.accessibilityHidden(true)`; name/username VStack →
  `.accessibilityElement(children: .combine)` (one identity stop "Name @username";
  the unblock `Button` keeps its existing `.accessibilityLabel`).
- Header: title `Text` → `.accessibilityAddTraits(.isHeader)`.

Empty state already accessible via `EmptyStateView` (combine + label) → untouched.
Unblock is reachable via the visible in-row button (VoiceOver) as well as the
swipe action → no custom `.accessibilityAction` needed.

## Verification
- Static: all modifiers are iOS 16.0+ standard SwiftUI. App floor iOS 16 → no guard.
- No test references `BlockedUsersView` (grep = 0). No production call-site change.
- CI gate: `iOS Tests` (macOS runner) — Linux container, so build/VoiceOver run in CI.
