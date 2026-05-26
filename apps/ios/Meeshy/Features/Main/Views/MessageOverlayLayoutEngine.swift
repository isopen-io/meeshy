import CoreGraphics
import SwiftUI

/// Horizontal anchor for the scaled-down bubble. Mirrors the source
/// bubble's alignment so a "me" bubble that touched the right edge stays
/// glued to the right edge after scale-down, and a received bubble that
/// touched the left edge stays glued to the left edge. Without this the
/// engine would shrink the bubble around its `minX`, leaving a visual gap
/// on the side it was originally pinned to — the bubble looks "centered"
/// to the user. Spec §5.2.0.
enum BubbleAlignment: Equatable {
    case leading   // left-aligned (received messages)
    case trailing  // right-aligned (own messages)
}

/// Inputs to `MessageOverlayLayoutEngine.compute`. All metrics are in screen
/// coordinates. `availableViewportSize` is intentionally NOT
/// `UIScreen.main.bounds` — it must be the size of the SwiftUI window scene
/// (read from a root `GeometryReader`) so the engine stays correct under
/// iPad split-view / multi-window.
struct OverlayLayoutInput: Equatable {
    let bubbleSourceFrame: CGRect
    let bubbleAlignment: BubbleAlignment
    let menuSize: CGSize
    let availableViewportSize: CGSize
    let safeAreaInsets: EdgeInsets
    let preferredGap: CGFloat
    let topPadding: CGFloat
    let bottomPadding: CGFloat
    let horizontalEdgeMargin: CGFloat
    let minimumBubbleScale: CGFloat

    init(
        bubbleSourceFrame: CGRect,
        bubbleAlignment: BubbleAlignment = .leading,
        menuSize: CGSize,
        availableViewportSize: CGSize,
        safeAreaInsets: EdgeInsets,
        preferredGap: CGFloat = 12,
        topPadding: CGFloat = 24,
        bottomPadding: CGFloat = 24,
        horizontalEdgeMargin: CGFloat = 16,
        minimumBubbleScale: CGFloat = 0.6
    ) {
        self.bubbleSourceFrame = bubbleSourceFrame
        self.bubbleAlignment = bubbleAlignment
        self.menuSize = menuSize
        self.availableViewportSize = availableViewportSize
        self.safeAreaInsets = safeAreaInsets
        self.preferredGap = preferredGap
        self.topPadding = topPadding
        self.bottomPadding = bottomPadding
        self.horizontalEdgeMargin = horizontalEdgeMargin
        self.minimumBubbleScale = minimumBubbleScale
    }
}

struct OverlayLayoutOutput: Equatable {
    let bubbleFinalFrame: CGRect
    let bubbleScale: CGFloat
    let menuFrame: CGRect
    let menuAnchor: MenuAnchor
    let liftOffset: CGFloat
}

enum MenuAnchor {
    case below
    case above
}

/// Pure layout engine for the message context overlay.
///
/// Given the position of a bubble in screen coordinates and the intrinsic
/// size of the actions menu, returns the final position of the bubble (with
/// possible lift / scale-down) and the position of the menu (always anchored
/// below the bubble after any lift). The algorithm is iMessage-strict: keep
/// the bubble at its source position whenever possible; lift only if the
/// menu can't fit below; scale down only if the bubble itself doesn't fit
/// with the menu.
///
/// The full algorithm and rationale is documented in
/// `docs/superpowers/specs/2026-05-24-ios-message-longpress-overlay-redesign-design.md`
/// section 5.2 (cases 0/1/2/3).
enum MessageOverlayLayoutEngine {
    static func compute(input: OverlayLayoutInput) -> OverlayLayoutOutput {
        let safeTop = input.safeAreaInsets.top + input.topPadding
        let safeBottom = input.availableViewportSize.height
            - input.safeAreaInsets.bottom
            - input.bottomPadding
        let availableHeight = max(0, safeBottom - safeTop)
        let menuNeeded = input.menuSize.height + input.preferredGap

        let bubbleSourceHeight = input.bubbleSourceFrame.height

        // ─── Cas 0 : bubble + menu doesn't fit in available height ───
        if bubbleSourceHeight + menuNeeded > availableHeight {
            let targetBubbleHeight = max(0, availableHeight - menuNeeded - 8)
            let proposedScale = bubbleSourceHeight > 0
                ? targetBubbleHeight / bubbleSourceHeight
                : 1.0
            let bubbleScale = max(input.minimumBubbleScale, proposedScale)
            let scaledHeight = bubbleSourceHeight * bubbleScale
            let scaledWidth = input.bubbleSourceFrame.width * bubbleScale
            // Pin the scaled bubble to the same edge as the source so a
            // right-aligned "me" bubble doesn't drift left when it shrinks
            // (and vice versa). The opposite edge becomes the "free" side
            // where the shrink absorbs the width delta.
            let scaledMinX: CGFloat
            switch input.bubbleAlignment {
            case .leading:
                scaledMinX = input.bubbleSourceFrame.minX
            case .trailing:
                scaledMinX = input.bubbleSourceFrame.maxX - scaledWidth
            }
            let bubbleFinalFrame = CGRect(
                x: scaledMinX,
                y: safeTop,
                width: scaledWidth,
                height: scaledHeight
            )
            let menuFrame = makeMenuFrame(
                bubbleFrame: bubbleFinalFrame,
                input: input
            )
            return OverlayLayoutOutput(
                bubbleFinalFrame: bubbleFinalFrame,
                bubbleScale: bubbleScale,
                menuFrame: menuFrame,
                menuAnchor: .below,
                liftOffset: bubbleFinalFrame.minY - input.bubbleSourceFrame.minY
            )
        }

        let roomBelow = safeBottom - input.bubbleSourceFrame.maxY
        let roomAbove = input.bubbleSourceFrame.minY - safeTop

        // ─── Cas 1 : room below is enough → no lift ───
        if roomBelow >= menuNeeded {
            let menuFrame = makeMenuFrame(
                bubbleFrame: input.bubbleSourceFrame,
                input: input
            )
            return OverlayLayoutOutput(
                bubbleFinalFrame: input.bubbleSourceFrame,
                bubbleScale: 1.0,
                menuFrame: menuFrame,
                menuAnchor: .below,
                liftOffset: 0
            )
        }

        // ─── Cas 2 : not enough room below, but enough above → lift just enough ───
        if roomAbove >= menuNeeded {
            let deficit = menuNeeded - roomBelow
            let liftOffset = -deficit
            let bubbleFinalFrame = input.bubbleSourceFrame.offsetBy(dx: 0, dy: liftOffset)
            let menuFrame = makeMenuFrame(
                bubbleFrame: bubbleFinalFrame,
                input: input
            )
            return OverlayLayoutOutput(
                bubbleFinalFrame: bubbleFinalFrame,
                bubbleScale: 1.0,
                menuFrame: menuFrame,
                menuAnchor: .below,
                liftOffset: liftOffset
            )
        }

        // ─── Cas 3 : pathological — clamp bubble to safe top ───
        let liftOffset = safeTop - input.bubbleSourceFrame.minY
        let bubbleFinalFrame = input.bubbleSourceFrame.offsetBy(dx: 0, dy: liftOffset)
        let menuFrame = makeMenuFrame(
            bubbleFrame: bubbleFinalFrame,
            input: input
        )
        return OverlayLayoutOutput(
            bubbleFinalFrame: bubbleFinalFrame,
            bubbleScale: 1.0,
            menuFrame: menuFrame,
            menuAnchor: .below,
            liftOffset: liftOffset
        )
    }

    private static func makeMenuFrame(
        bubbleFrame: CGRect,
        input: OverlayLayoutInput
    ) -> CGRect {
        let menuWidth = input.menuSize.width
        let menuHeight = input.menuSize.height
        let bubbleMidX = bubbleFrame.midX
        let proposedMinX = bubbleMidX - menuWidth / 2
        let minAllowed = input.horizontalEdgeMargin
        let maxAllowed = max(
            minAllowed,
            input.availableViewportSize.width - input.horizontalEdgeMargin - menuWidth
        )
        let clampedMinX = min(max(proposedMinX, minAllowed), maxAllowed)
        let menuY = bubbleFrame.maxY + input.preferredGap
        return CGRect(
            x: clampedMinX,
            y: menuY,
            width: menuWidth,
            height: menuHeight
        )
    }
}
