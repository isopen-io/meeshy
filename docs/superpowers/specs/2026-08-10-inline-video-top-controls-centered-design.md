# Inline video player — center the top control cluster

**Date**: 2026-08-10
**Status**: Accepted (pure layout change)

## Context

User request (relayed secondhand through the orchestrating agent — the reference
screenshot itself was never visible to the implementing agent, only this text
description): make the inline video players on iOS look more like a reference
image, specifically with the top row of on-screen controls centered on the
canvas instead of wherever it currently sits. This reads as a common
short-form-video UX pattern (TikTok/Instagram Reels: a small control cluster
floating centered at the top of the frame).

Investigation found the single target: `_InlineOverlayControls.topBar` in
`packages/MeeshySDK/Sources/MeeshyUI/Media/VideoTransportControls.swift`. This
is the top-row overlay rendered by `MeeshyVideoPlayer(style: .inline)`, the one
shared SDK renderer used by all three non-fullscreen ("inline") video surfaces
in the app:
- Chat bubble grid video cell (`BubbleGridCell.videoBody`,
  `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift`)
- Chat bubble carousel video slide (`BubbleCarouselView.carouselVideoCell`,
  same file)
- Feed post video cell (`FeedVideoMediaCell`,
  `apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift`)

Current `topBar`:
```swift
HStack {
    if controls.contains(.expand) { expandButton }   // pinned top-leading
    Spacer()
    if controls.contains(.speed) { speedPill }        // pinned top-trailing
}
```
Split to opposite corners — literally the "split to corners" case the task
description anticipated.

Explicitly out of scope (confirmed by reading in full): `ReelsPlayerView` /
`ReelFeedVideoSurface` (dedicated fullscreen Reels player, different design
language), `_FullscreenOverlayControls` / `ConversationMediaGalleryView` /
`VideoLegacySupport.VideoFullscreenPlayer` (all fullscreen covers, not inline
canvases), `BubbleCarouselView.carouselTopBar` (gallery chrome — close + page
dots — shown for image slides too, not video-control-specific).

## Decision

Cluster the two existing controls (expand button, speed pill) into one
`HStack` with no `Spacer` between them, and center that cluster horizontally
via `.frame(maxWidth: .infinity)` (default center alignment). Zero new UI,
zero behavior change — same buttons, same icons, same taps, same styling.
Because both call sites route through this one SDK component, the fix
propagates to bubble grid, bubble carousel, and feed automatically with no
app-side wiring changes.

Edge case: when only one of `.expand` / `.speed` is present in the
`ControlSet`, the remaining single button centers alone — this reads as
intentional (a lone centered icon at the top of the frame is itself a
common pattern, not a broken split-layout artifact).

## Alternatives rejected

- **Move both buttons inward but keep them split** (e.g. reduce horizontal
  padding): doesn't match "centered" — still two separate anchor points.
- **Wrap the cluster in a new capsule/pill background**: introduces new
  chrome not requested and not visible in any reference the implementing
  agent has access to — violates the "no invented redesign" constraint.
- **Editing `ConversationMediaGalleryView.controlsOverlay` or
  `BubbleCarouselView.carouselTopBar` instead**: those are fullscreen/gallery
  chrome (close + save + page-index), not the inline video canvas overlay the
  request describes, and already read as balanced (Spacer-Spacer 3-part row).

## Verification

Pure SwiftUI positioning change — no new logic to unit test. Verification is
before/after simulator screenshots of a playing inline video (chat bubble and
feed) plus `./apps/ios/meeshy.sh build` / `test`.

## Caveat

Implemented from the requester's textual description alone. No reference
image was available to the implementing agent. This should be visually
compared against the original reference before merging.
