# Plan — Iteration 195i — CommunityLinksView cold-start skeleton

## Base
- Source branch: `main` HEAD `7fe702b`
- Working branch: `claude/laughing-thompson-dj6dd5`
- Iteration: 195i (strictly > 194i, highest open PR in the `laughing-thompson` swarm)

## Problem (Instant App violation)
`CommunityLinksView.communityLinksSection` renders a bare
`ProgressView().frame(maxWidth: .infinity).padding(40)` while
`viewModel.isLoading` is true.

The ViewModel is already cache-first: `load()` reads
`CacheCoordinator.shared.communityLinks` and sets
`isLoading = links.isEmpty` **only** on `.expired`/`.empty`. So the spinner
appears exclusively on cold start (empty cache) — precisely the case the
Instant App principle covers:

> Use SkeletonPlaceholder (not ProgressView) on empty cache (cold start).

A spinner communicates nothing about the shape of what's loading, forces the
eye to a single point, and reads as "generic wait" rather than "your list is
arriving". The two sibling screens (`ShareLinksView`, `TrackingLinksView`)
share the same defect but are deferred to keep this iteration to one surface.

## Fix
1. New reusable leaf `SkeletonLinkRow` + `SkeletonLinkList` in
   `Features/Main/Views/Skeletons/SkeletonLinkRow.swift`, mirroring
   `communityLinkRow`'s structure (40pt avatar circle, title line, subtitle
   line, trailing action glyph). Follows the established skeleton idiom
   (`SkeletonFeedPost`): `import MeeshyUI`, `SkeletonShape` + `skeletonShimmer()`,
   neutral `colorScheme`-driven placeholder colors, per-row
   `.accessibilityElement(children: .ignore)` + `.accessibilityLabel`
   ("Chargement d'un lien") so VoiceOver announces the loading state instead
   of the previous silent spinner.
2. Reduce Motion handled for free — `ShimmerModifier` already freezes the
   sweep under system or in-app reduce-motion.
3. Wire into `CommunityLinksView`: `ProgressView(...)` → `SkeletonLinkList()`.

## Constraints honored
- 1 new file (auto-included by XcodeGen globbing, no pbxproj edit) + 1 edited
  file. 0 logic / 0 network / 0 ViewModel change.
- 1 new inline i18n key `skeleton.link_row.loading` (0 xcstrings, mirrors
  `skeleton.feed.post.loading`).
- No new import in `CommunityLinksView` (`SkeletonLinkList` is same-module).
- Reusable: `SkeletonLinkList` is available for `ShareLinksView` /
  `TrackingLinksView` in a future iteration.
- 0 contention: no open PR touches `CommunityLinksView` or the `Skeletons/`
  folder.

## Verification
- Gate = CI `iOS Tests` (Linux env has no Xcode). No test references the view.
- Visual: skeleton rows match the live-row rhythm (spacing 8, padding 14,
  cornerRadius 14); light + dark placeholder colors mirror `SkeletonFeedPost`.
