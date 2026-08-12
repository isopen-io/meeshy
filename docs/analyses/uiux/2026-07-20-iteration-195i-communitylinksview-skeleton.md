# Analysis — Iteration 195i — CommunityLinksView cold-start skeleton

## Scope
iOS only. Single surface: `CommunityLinksView` (Communauté → « Liens
communauté »).

## Finding
`communityLinksSection` (`CommunityLinksView.swift:107-108`) displayed a bare
`ProgressView()` during `viewModel.isLoading`. The ViewModel already follows
the cache-first pattern (`isLoading = links.isEmpty` set only on
`.expired`/`.empty`), so the spinner surfaces exclusively on cold start with
an empty cache — the exact scenario the Instant App principle mandates a
skeleton for ("Use SkeletonPlaceholder (not ProgressView) on empty cache").

Secondary a11y gap: the spinner had no accessibility label, so VoiceOver
users heard nothing during the cold-start load.

## Resolution
- Added reusable `SkeletonLinkRow` / `SkeletonLinkList`
  (`Features/Main/Views/Skeletons/SkeletonLinkRow.swift`) mirroring
  `communityLinkRow`'s layout and the `SkeletonFeedPost` idiom
  (`SkeletonShape` + `skeletonShimmer()`, `colorScheme`-driven neutral
  placeholder colors, Reduce-Motion honored by `ShimmerModifier`).
- Each skeleton row is `.accessibilityElement(children: .ignore)` +
  `.accessibilityLabel("Chargement d'un lien")` → VoiceOver now announces the
  loading state (previously silent).
- Replaced `ProgressView(...)` with `SkeletonLinkList()` in
  `CommunityLinksView`.

## Rationale
- Structural skeletons preserve the list's vertical rhythm and read as
  "content is arriving" rather than a generic wait.
- The new component is deliberately generic (avatar + title + subtitle +
  trailing action) so `ShareLinksView` and `TrackingLinksView` — which share
  the identical `ProgressView` cold-start defect — can adopt it later without
  new work.

## Remaining improvements (future iterations, 1 surface each)
- `ShareLinksView` cold-start `ProgressView` → `SkeletonLinkList`.
- `TrackingLinksView` cold-start `ProgressView` → `SkeletonLinkList`.
- `FeedCommentsSheet` (1717 l) `.system(size:)` → Dynamic Type (dedicated
  iteration).

## Verification status
- Gate = CI `iOS Tests` (Linux environment has no Xcode; local build not
  possible). No existing test references `CommunityLinksView` or the skeleton.
- Change is 1 new file + 1 edited file, 0 logic / 0 network / 0 ViewModel
  change, 1 inline i18n key (0 xcstrings).

## Status: RESOLVED (pending CI green + merge)
`CommunityLinksView` cold-start spinner eradicated. Do not re-flag the
`ProgressView` there. `SkeletonLinkList` now available for sibling adoption.
