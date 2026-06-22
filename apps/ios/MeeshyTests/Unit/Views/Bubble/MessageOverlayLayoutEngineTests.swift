import XCTest
import SwiftUI
@testable import Meeshy

@MainActor
final class MessageOverlayLayoutEngineTests: XCTestCase {

    private static let iPhone16ProSize = CGSize(width: 393, height: 852)
    private static let iPhoneSE2ndGenSize = CGSize(width: 375, height: 667)
    private static let iPhone16ProSafeArea = EdgeInsets(top: 59, leading: 0, bottom: 34, trailing: 0)
    private static let iPhoneSESafeArea = EdgeInsets(top: 24, leading: 0, bottom: 0, trailing: 0)
    private static let standardMenuSize = CGSize(width: 348, height: 48)
    private static let smallMenuSize = CGSize(width: 180, height: 48)
    private static let wideMenuSize = CGSize(width: 420, height: 48)

    private func makeInput(
        bubbleSourceFrame: CGRect,
        bubbleAlignment: BubbleAlignment = .leading,
        menuSize: CGSize = standardMenuSize,
        availableViewportSize: CGSize = iPhone16ProSize,
        safeAreaInsets: EdgeInsets = iPhone16ProSafeArea,
        preferredGap: CGFloat = 12,
        topPadding: CGFloat = 24,
        bottomPadding: CGFloat = 24,
        horizontalEdgeMargin: CGFloat = 16
    ) -> OverlayLayoutInput {
        OverlayLayoutInput(
            bubbleSourceFrame: bubbleSourceFrame,
            bubbleAlignment: bubbleAlignment,
            menuSize: menuSize,
            availableViewportSize: availableViewportSize,
            safeAreaInsets: safeAreaInsets,
            preferredGap: preferredGap,
            topPadding: topPadding,
            bottomPadding: bottomPadding,
            horizontalEdgeMargin: horizontalEdgeMargin
        )
    }

    // MARK: - Cas 1: bubble fits with room below

    func test_compute_bubbleInMiddle_returnsNoLift_menuBelow() {
        let input = makeInput(
            bubbleSourceFrame: CGRect(x: 16, y: 300, width: 250, height: 80)
        )

        let output = MessageOverlayLayoutEngine.compute(input: input)

        XCTAssertEqual(output.bubbleFinalFrame, input.bubbleSourceFrame)
        XCTAssertEqual(output.bubbleScale, 1.0)
        XCTAssertEqual(output.menuAnchor, .below)
        XCTAssertEqual(output.liftOffset, 0)
        XCTAssertEqual(output.menuFrame.minY, 392, accuracy: 0.01,
                       "Menu Y = bubble.maxY (380) + gap (12)")
    }

    // MARK: - Cas 2: bubble near bottom, room above → lift

    func test_compute_bubbleAtBottom_returnsLiftUp_menuBelow() {
        let bubbleHeight: CGFloat = 80
        let safeBottom = Self.iPhone16ProSize.height - 34 - 24
        let bubbleY = safeBottom - 20

        let input = makeInput(
            bubbleSourceFrame: CGRect(x: 16, y: bubbleY, width: 250, height: bubbleHeight)
        )

        let output = MessageOverlayLayoutEngine.compute(input: input)

        XCTAssertLessThan(output.liftOffset, 0, "Bubble should lift upward")
        XCTAssertEqual(output.bubbleScale, 1.0)
        XCTAssertEqual(output.menuAnchor, .below)
        XCTAssertEqual(
            output.menuFrame.maxY, safeBottom, accuracy: 0.01,
            "Menu should sit exactly at safeBottom after lift"
        )
    }

    // MARK: - Cas 3: pathological, neither below nor above

    func test_compute_bubbleAtTop_smallScreen_returnsClampedTop_menuBelow() {
        // iPhone SE 2nd gen : safeTop=48, safeBottom=643, availableHeight=595,
        // menuNeeded=60. Cas 3 needs bubble straddling the middle so neither
        // room is enough for the menu. bubbleHeight=500, y=95 yields
        // roomAbove=47, roomBelow=48 → both < 60, Cas 3 triggers.
        let input = makeInput(
            bubbleSourceFrame: CGRect(x: 16, y: 95, width: 300, height: 500),
            availableViewportSize: Self.iPhoneSE2ndGenSize,
            safeAreaInsets: Self.iPhoneSESafeArea
        )

        let output = MessageOverlayLayoutEngine.compute(input: input)

        let expectedTop: CGFloat = Self.iPhoneSESafeArea.top + 24
        XCTAssertEqual(output.bubbleFinalFrame.minY, expectedTop, accuracy: 0.01,
                       "Bubble clamped to safeTop (24 inset + 24 padding)")
        XCTAssertEqual(output.bubbleScale, 1.0)
        XCTAssertEqual(output.menuAnchor, .below)
        XCTAssertLessThan(output.liftOffset, 0, "Lift offset is negative (upward)")
    }

    // MARK: - Cas 0: bubble taller than viewport

    func test_compute_bubbleTallerThanViewport_scalesDownToFit() {
        let oversizedBubble = CGRect(x: 16, y: 200, width: 300, height: 800)
        let input = makeInput(
            bubbleSourceFrame: oversizedBubble,
            availableViewportSize: Self.iPhone16ProSize
        )

        let output = MessageOverlayLayoutEngine.compute(input: input)

        XCTAssertLessThan(output.bubbleScale, 1.0, "Bubble must scale down to fit")
        XCTAssertGreaterThanOrEqual(output.bubbleScale, 0.6, "Scale floor at 0.6")
        XCTAssertEqual(output.bubbleFinalFrame.minY, Self.iPhone16ProSafeArea.top + 24, accuracy: 0.01)
        XCTAssertEqual(output.menuAnchor, .below)
        let menuMaxY = output.menuFrame.maxY
        let safeBottom = Self.iPhone16ProSize.height - Self.iPhone16ProSafeArea.bottom - 24
        XCTAssertLessThanOrEqual(menuMaxY, safeBottom + 0.01, "Menu fits within safe bottom")
    }

    func test_compute_bubbleTallerThanViewport_trailingAlignment_pinsToRightEdge() {
        // Bulle "moi" (right-aligned) qui touche le bord droit du viewport,
        // trop haute pour rentrer → Cas 0 scale-down. La bulle scaled doit
        // GARDER son `maxX` identique à la source (collée au bord droit),
        // pas dériver vers la gauche.
        let viewportWidth: CGFloat = Self.iPhone16ProSize.width
        let bubbleWidth: CGFloat = 280
        let bubbleMinX = viewportWidth - 16 - bubbleWidth // ancré à 16pt du bord droit
        let oversizedTrailingBubble = CGRect(
            x: bubbleMinX, y: 200, width: bubbleWidth, height: 800
        )
        let input = makeInput(
            bubbleSourceFrame: oversizedTrailingBubble,
            bubbleAlignment: .trailing
        )

        let output = MessageOverlayLayoutEngine.compute(input: input)

        XCTAssertLessThan(output.bubbleScale, 1.0, "Doit scale-down")
        XCTAssertEqual(
            output.bubbleFinalFrame.maxX,
            oversizedTrailingBubble.maxX,
            accuracy: 0.01,
            "Bulle 'moi' scaled doit rester glued au maxX d'origine"
        )
        XCTAssertLessThan(
            output.bubbleFinalFrame.width,
            oversizedTrailingBubble.width,
            "Largeur effectivement réduite par le scale"
        )
    }

    func test_compute_bubbleTallerThanViewport_leadingAlignment_pinsToLeftEdge() {
        // Bulle reçue (left-aligned) qui touche le bord gauche, trop haute
        // → Cas 0 scale-down. La bulle scaled doit GARDER son `minX`
        // identique à la source (collée au bord gauche), pas dériver vers
        // la droite.
        let oversizedLeadingBubble = CGRect(x: 16, y: 200, width: 280, height: 800)
        let input = makeInput(
            bubbleSourceFrame: oversizedLeadingBubble,
            bubbleAlignment: .leading
        )

        let output = MessageOverlayLayoutEngine.compute(input: input)

        XCTAssertLessThan(output.bubbleScale, 1.0)
        XCTAssertEqual(
            output.bubbleFinalFrame.minX,
            oversizedLeadingBubble.minX,
            accuracy: 0.01,
            "Bulle reçue scaled doit rester glued au minX d'origine"
        )
    }

    func test_compute_bubbleTallerThanViewport_minScale06_truncatesOverflow() {
        let hugeBubble = CGRect(x: 16, y: 100, width: 300, height: 5000)
        let input = makeInput(
            bubbleSourceFrame: hugeBubble,
            availableViewportSize: Self.iPhoneSE2ndGenSize,
            safeAreaInsets: Self.iPhoneSESafeArea
        )

        let output = MessageOverlayLayoutEngine.compute(input: input)

        XCTAssertEqual(output.bubbleScale, 0.6, accuracy: 0.001,
                       "Scale floor enforced even when bubble vastly exceeds viewport")
    }

    // MARK: - Menu horizontal clamping

    func test_compute_menuOverflowsRight_clampsMenuX() {
        let bubbleNearRightEdge = CGRect(x: 350, y: 300, width: 40, height: 40)
        let input = makeInput(
            bubbleSourceFrame: bubbleNearRightEdge,
            menuSize: Self.standardMenuSize
        )

        let output = MessageOverlayLayoutEngine.compute(input: input)

        let expectedMaxX = Self.iPhone16ProSize.width - 16
        XCTAssertEqual(output.menuFrame.maxX, expectedMaxX, accuracy: 0.01,
                       "Menu clamped to right edge - 16pt margin")
    }

    func test_compute_menuOverflowsLeft_clampsMenuX() {
        let bubbleNearLeftEdge = CGRect(x: 4, y: 300, width: 40, height: 40)
        let input = makeInput(
            bubbleSourceFrame: bubbleNearLeftEdge,
            menuSize: Self.standardMenuSize
        )

        let output = MessageOverlayLayoutEngine.compute(input: input)

        XCTAssertEqual(output.menuFrame.minX, 16, accuracy: 0.01,
                       "Menu clamped to left edge + 16pt margin")
    }

    // MARK: - Action count → menu size

    func test_compute_actionCount3_smallMenuFitsWithoutClamp() {
        let input = makeInput(
            bubbleSourceFrame: CGRect(x: 100, y: 300, width: 200, height: 80),
            menuSize: Self.smallMenuSize
        )

        let output = MessageOverlayLayoutEngine.compute(input: input)

        let expectedMidX = output.bubbleFinalFrame.midX
        XCTAssertEqual(output.menuFrame.midX, expectedMidX, accuracy: 0.01,
                       "Small menu centers under bubble without clamping")
        XCTAssertEqual(output.menuFrame.width, 180)
    }

    func test_compute_actionCount7_wideMenuClampsToScreen() {
        let input = makeInput(
            bubbleSourceFrame: CGRect(x: 100, y: 300, width: 200, height: 80),
            menuSize: Self.wideMenuSize
        )

        let output = MessageOverlayLayoutEngine.compute(input: input)

        XCTAssertGreaterThanOrEqual(output.menuFrame.minX, 16,
                                    "Wide menu still respects left margin")
        XCTAssertEqual(output.menuFrame.minX, 16, accuracy: 0.01,
                       "Wide menu starts exactly at left margin when it would otherwise overflow")
    }

    // MARK: - Safe area handling

    func test_compute_safeAreaTop44_respectsTopPadding() {
        // With safeAreaInsets.top=44 and topPadding=24, safeTop=68. The engine
        // only consults safeTop when computing lift/Cas 3 — bubbles that fit
        // with room below (Cas 1) stay at their source position even if they
        // visually intrude above safeTop. This test exercises the safeTop
        // calculation via a Cas 3 trigger where clamping actually occurs.
        let customSafeArea = EdgeInsets(top: 44, leading: 0, bottom: 34, trailing: 0)
        // Viewport 393×400 (forced narrow height), safeTop=68, safeBottom=342,
        // availableHeight=274, menuNeeded=60. bubbleHeight=200, y=90 yields
        // roomAbove=22, roomBelow=52 → both < 60, Cas 3.
        let input = makeInput(
            bubbleSourceFrame: CGRect(x: 16, y: 90, width: 250, height: 200),
            availableViewportSize: CGSize(width: 393, height: 400),
            safeAreaInsets: customSafeArea
        )

        let output = MessageOverlayLayoutEngine.compute(input: input)

        XCTAssertEqual(output.bubbleFinalFrame.minY, 68, accuracy: 0.01,
                       "Bubble clamped to safeAreaInsets.top (44) + topPadding (24) = 68")
    }

    func test_compute_bubbleExactlyAtSafeBottom_treatsAsCase2() {
        let safeBottom = Self.iPhone16ProSize.height - 34 - 24
        let bubbleHeight: CGFloat = 80
        let bubbleAtSafeBottom = CGRect(
            x: 16,
            y: safeBottom - bubbleHeight,
            width: 250,
            height: bubbleHeight
        )

        let input = makeInput(bubbleSourceFrame: bubbleAtSafeBottom)
        let output = MessageOverlayLayoutEngine.compute(input: input)

        XCTAssertLessThan(output.liftOffset, 0,
                          "Bubble exactly at safe bottom must lift to make room")
        XCTAssertEqual(output.menuAnchor, .below)
    }

    func test_compute_smallSplitViewSize_clampsAllSides() {
        // iPad split-view: narrow width, full height. With a menu that fits
        // within (viewport - 2*horizontalMargin), the engine clamps both sides
        // correctly. Menus wider than the available horizontal slot are out
        // of scope for the engine — caller is expected to size the menu
        // (via `ContextActionMenu.estimatedSize`) to fit the viewport before
        // invoking compute.
        let splitViewSize = CGSize(width: 320, height: 1024)
        let input = makeInput(
            bubbleSourceFrame: CGRect(x: 8, y: 300, width: 300, height: 80),
            menuSize: Self.smallMenuSize,
            availableViewportSize: splitViewSize,
            safeAreaInsets: EdgeInsets(top: 24, leading: 0, bottom: 20, trailing: 0)
        )

        let output = MessageOverlayLayoutEngine.compute(input: input)

        XCTAssertGreaterThanOrEqual(output.menuFrame.minX, 16,
                                    "Menu respects left margin in narrow viewport")
        XCTAssertLessThanOrEqual(output.menuFrame.maxX, splitViewSize.width - 16,
                                 "Menu respects right margin in narrow viewport")
    }
}
