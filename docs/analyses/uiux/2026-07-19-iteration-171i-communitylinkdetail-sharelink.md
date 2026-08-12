# Iteration-171i — Native `ShareLink` for `CommunityLinkDetailView`

**Date:** 2026-07-19
**Scope:** iOS only
**Area:** Native platform integration (HIG) + code simplification — community join-link sharing
**File touched:** `apps/ios/Meeshy/Features/Main/Views/CommunityLinkDetailView.swift` (1 file, 0 logic behavior change, 0 new test)

## Component

`CommunityLinkDetailView` is the detail screen for a community join link (owner
view). Its `actionsBar` exposes three tile buttons — **Copy**, **Share**,
**Identify** — that operate on the link's `joinUrl` / `identifier`.

## Finding

The **Share** button reimplemented iOS's share sheet by hand:

```swift
let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
      let window = scene.windows.first,
      let root = window.rootViewController else { return }
var topVC = root
while let presented = topVC.presentedViewController { topVC = presented }
if let popover = av.popoverPresentationController { … }   // manual iPad anchor
topVC.present(av, animated: true)
```

This is ~15 lines of imperative UIKit window-hierarchy traversal to do exactly
what the first-party SwiftUI `ShareLink` (iOS 16.0+, the app's deployment floor)
does declaratively — including top-view-controller presentation and the iPad
popover anchoring that the manual path had to hand-roll (and which crashes if
forgotten). `ShareLink` is already the established pattern across the app
(12+ call sites: `ShareLinksView`, `ConversationListView`, `StoryViewerView`,
`ThemedConversationRow`, …); this screen was an outlier still on the raw
`UIActivityViewController` path.

## Fix

Replaced the manual share button with a native `ShareLink`, and extracted the
shared tile visual so the `Button`s and the `ShareLink` render identically:

- New `communityActionButtonLabel(_:icon:color:)` — the pure tile visual (52×52
  frozen glyph tile + caption), reused by all three actions. No visual change:
  same corner radius, colors, frozen `.system(size: 22)` glyph (doctrine 86i,
  bounded by the fixed tile), `.frame(maxWidth: .infinity)` distribution.
- New `shareActionButton` — a `ShareLink(item: url)` wrapping that label when
  `URL(string: link.joinUrl)` is valid; a dimmed, `.accessibilityHidden`
  non-interactive tile otherwise (preserves the 3-tile layout instead of the
  button vanishing, which the old `guard … else { return }` effectively did at
  tap time). Adds a light haptic via `.simultaneousGesture` for parity with the
  Copy/Identify tiles (Share previously had none).
- `communityActionButton(…)` now composes the shared label builder.

Net: the imperative `UIActivityViewController` presentation, the
`UIApplication.shared.connectedScenes` window walk, and the manual popover
anchoring are gone. Behavior is unchanged — sharing still offers the community
`joinUrl` through the system share sheet, now with correct iPad anchoring for
free.

## Rationale

The routine explicitly calls for preferring native Apple components
(`ShareLink`) over reinvented UIKit and for reducing custom implementations when
a first-party component already solves the problem. This removes bespoke,
crash-prone presentation code, aligns the screen with the app's dominant
`ShareLink` idiom, and improves iPad correctness — with zero change to the
visual identity or the product behavior.

## Verification

- **Static review:** `ShareLink(item: URL)` is iOS 16.0+ (app floor is 16.0);
  all other modifiers are standard SwiftUI. `UIPasteboard` (still used by Copy /
  Identify) resolves transitively via `import SwiftUI` on iOS, same as before —
  the removed `UIActivityViewController` / `UIApplication` usages were the only
  ones and are gone.
- **Scope:** 1 file. No ViewModel, service, model, or logic touched. No new i18n
  key (`common.share` reused). No test references the view (grep: only
  `RootView` / `iPadRootView` route into it — navigation, not tests).
- **Contention:** 0 open iOS PR touches `CommunityLinkDetailView`
  (open PRs cover MagicLink, LinkPreviewCard, ActiveSessionsView, BookmarksView,
  MessageEditsDetailView, ShareLinkDetailView, SharePicker, StatsTimelineChart,
  MessageTranscriptionDetailView, …).
- **Gate:** CI `iOS Tests` — SwiftUI does not compile under Linux, so CI is the
  sole authority for this change.

## Continuity annotation (do not re-flag)

- ⚠️ **`CommunityLinkDetailView` share path = SOLVED 171i.** It now uses native
  `ShareLink`; do not reintroduce a manual `UIActivityViewController`.
- Remaining manual `UIActivityViewController` sites (future native-share
  candidates, each its own file — verify contention first):
  `TrackingLinkDetailView`, `AffiliateView`, `ShareLinkDetailView` (⚠️ open PR
  #2040), `ConversationMediaViews`, `ConversationListView`. Note some are
  legitimately manual (multi-item, custom activities, or non-URL payloads) —
  triage before converting.
- **Base for next iteration: `main` HEAD** after this merges.
