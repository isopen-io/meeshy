# Iteration-178i — VoiceOver structure for `BlockedUsersView`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — screen heading + blocked-user row grouping + decorative skeletons
**File touched:** `apps/ios/Meeshy/Features/Main/Views/BlockedUsersView.swift` (1 file, 0 logic, 0 new key, 0 new test)

## Component

`BlockedUsersView` is the moderation screen listing the users the current
account has blocked (Settings → Privacy → « Utilisateurs bloqués »). It has a
custom header (back button + title), three content states (skeleton loading,
`EmptyStateView`, and the list), and a `List` of blocked-user rows. Each row
shows a `MeeshyAvatar`, the display name, the `@username`, and a trailing
**Débloquer** capsule button; a trailing swipe action offers the same unblock,
and a confirmation `alert` guards the destructive step.

The screen was already **fully localized** (every visible string via
`String(localized:defaultValue:)`), **Dynamic-Type-ready** (all text through
`MeeshyFont.relative`), and the destructive unblock already had a confirmation
`alert` and an `.accessibilityLabel` on its trailing button. The remaining gap
was **VoiceOver structure** — identical in shape to the gap resolved on the
sibling `ActiveSessionsView` in 168i (just merged, same iOS track).

## Findings

Three purely-accessibility defects, no visual/logic issues:

1. **Screen title carried no `.isHeader` trait.** The header `Text`
   (« Utilisateurs bloqués ») was a plain label, so a VoiceOver user could not
   jump to it with the heading rotor — the same gap fixed on `ActiveSessionsView`
   (168i), `AffiliateView`, `AboutView`, and others that use this custom-header
   shape.

2. **The blocked-user identity was fragmented into 3+ VoiceOver stops with a
   duplicated name.** The row's `MeeshyAvatar` sets `.accessibilityLabel(name)`
   internally, so VoiceOver read **the name twice** — once from the avatar, once
   from the name `Text` — then the `@username` as a third separate stop, before
   reaching the unblock button. Sweeping the list was noisy and repetitive.

3. **The loading skeleton rows were focusable.** The shimmer placeholder
   `loadingState` (4 fake rows of tinted rectangles) exposed each decorative
   shape to VoiceOver, so a user landing on the screen during a cold load swept
   through empty, meaningless elements instead of hearing nothing while data
   arrived.

## Fix

Applied the canonical 168i `ActiveSessionsView` pattern verbatim, scoped to
three spots:

- **Header:** `.accessibilityAddTraits(.isHeader)` on the title `Text`.
- **Row identity block:** wrapped the `MeeshyAvatar` + name/username `VStack`
  in an inner `HStack` carrying `.accessibilityElement(children: .combine)`, and
  hid the avatar with `.accessibilityHidden(true)` (its internal `name` label
  would otherwise double the name). VoiceOver now reads a single clean stop —
  « <nom>, @<username> » — followed by the **Débloquer** button as a distinct,
  still-labelled actionable sibling (kept outside the combined group).
- **Loading state:** `.accessibilityHidden(true)` on the `loadingState`
  container so the decorative skeletons stay out of the rotor (parity with 169i
  loading-state hiding).

No `EmptyStateView` change was needed — it already renders a labelled title +
subtitle. The swipe-action unblock and the confirmation `alert` were untouched.

## Rationale

Unblocking is a low-frequency but deliberate action; a VoiceOver user must be
able to identify *which* person a row represents and reach the unblock control
without wading through a duplicated name and decorative shimmer. The fix mirrors
the exact treatment shipped on the sibling `ActiveSessionsView` one iteration
earlier, keeping the two privacy/session-management screens consistent for
assistive-technology users. Layout, color, Indigo identity, haptics, and the
destructive-confirmation flow are all unchanged.

## Verification

- **Static review:** `.accessibilityAddTraits(.isHeader)`,
  `.accessibilityElement(children: .combine)`, and `.accessibilityHidden(true)`
  are standard SwiftUI iOS 16.0+ APIs with direct precedent one iteration prior
  (168i `ActiveSessionsView`, same row shape). App floor is iOS 16.0 — no
  availability guard needed.
- **No visual/logic change:** only accessibility modifiers were added; the
  visible row, skeleton animation, unblock button, swipe action, confirmation
  alert, and load/unblock service calls are byte-for-byte unchanged.
- **No test churn:** no test references `BlockedUsersView` (grep across
  `MeeshyTests` / `MeeshyUITests` / `MeeshySDKTests` = 0). No new i18n key
  (`.isHeader`/combine/hidden add no user-visible strings).
- **CI gate:** `iOS Tests` (macOS runner). This is a Linux container, so the
  Xcode build + VoiceOver validation happen in CI — confirm `iOS Tests` is green
  on the PR before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `BlockedUsersView` uses a **custom header** (back chevron + centered title +
  invisible 60pt spacer) instead of a native `NavigationStack` toolbar — a
  deeper, cross-screen migration candidate shared by many of these views; out of
  scope for a single a11y-only iteration.
- The unblock **capsule button** and the **swipe action** duplicate the same
  destructive affordance; the capsule tint uses `errorHex` while the swipe uses
  `MeeshyColors.success` — a minor visual-hierarchy inconsistency worth a future
  pass.
- Candidates from 177i still open: `PeopleDiscoveryView`/`DiscoveryTab`
  hardcoded unaccented French enum raw values; `CrashReportSheet` icon-only
  `ShareLink`; `VideoFullscreenPlayer` icon-only `xmark` dismiss.

**Status: RESOLVED for `BlockedUsersView` VoiceOver structure (heading + row grouping + skeleton hiding).**
