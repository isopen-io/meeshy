import XCTest
@testable import Meeshy

/// APP-1 — une seule pile de bannières sous l'en-tête de l'appel, ordre fixe
/// partage → enregistrement → capture → cadre, sans trou ni chevauchement du chevron.
@MainActor
final class CallTopBannerStackTests: XCTestCase {

    func test_ordered_allPresent_followsShareRecordingFrame() {
        XCTAssertEqual(
            CallTopBannerStack.ordered([.liveFrame, .screenShare, .recording]),
            [.screenShare, .recording, .liveFrame]
        )
    }

    /// #16665 R1 — la capsule de capture se range sous l'enregistrement R3,
    /// au-dessus du cadre : elle ne couvre jamais une autre bannière.
    func test_ordered_capture_sitsBelowRecordingAboveFrame() {
        XCTAssertEqual(
            CallTopBannerStack.ordered([.liveFrame, .capture, .screenShare, .recording]),
            [.screenShare, .recording, .capture, .liveFrame]
        )
    }

    func test_ordered_captureAlone_isRightUnderTheHeader() {
        XCTAssertEqual(CallTopBannerStack.ordered([.capture]), [.capture])
    }

    func test_ordered_missingMiddle_leavesNoGap() {
        XCTAssertEqual(CallTopBannerStack.ordered([.liveFrame, .screenShare]), [.screenShare, .liveFrame])
    }

    func test_ordered_single_isAlone() {
        XCTAssertEqual(CallTopBannerStack.ordered([.recording]), [.recording])
    }

    func test_ordered_everyArrivalOrder_givesTheSameStack() {
        let all = CallTopBanner.allCases
        for first in all {
            for second in all where second != first {
                let arrival = [first, second] + all.filter { $0 != first && $0 != second }
                XCTAssertEqual(CallTopBannerStack.ordered(Set(arrival)), all)
            }
        }
    }

    func test_ordered_none_isEmpty() {
        XCTAssertTrue(CallTopBannerStack.ordered([]).isEmpty)
    }

    func test_topInset_clearsTheHeaderRowAndItsTapTarget() {
        let chromeTop: CGFloat = 67
        let top = CallTopBannerStack.topInset(chromeTopInset: chromeTop)
        // La rangée d'en-tête occupe 44 pt (cible tactile du chevron « Réduire »).
        XCTAssertGreaterThanOrEqual(top, chromeTop + 44)
        XCTAssertEqual(top, chromeTop + CallTopBannerStack.headerRowClearance)
    }

    func test_topInset_followsTheSafeArea() {
        XCTAssertLessThan(
            CallTopBannerStack.topInset(chromeTopInset: 28),
            CallTopBannerStack.topInset(chromeTopInset: 67)
        )
    }

    func test_connectedView_stacksTheBannersUnderTheHeader_insteadOfFixedOffsets() throws {
        let connected = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+Connected.swift")
        )
        for offset in [".padding(.top, 60)", ".padding(.top, 110)", ".padding(.top, 160)"] {
            XCTAssertFalse(connected.contains(offset), "\(offset) : décalage figé qui passe sous le chevron « Réduire »")
        }
        XCTAssertTrue(connected.contains("CallTopBannerStack.topInset(chromeTopInset: Self.chromeTopInset)"))
        XCTAssertFalse(connected.contains("CallScreenShareBanner("), "la bannière vit dans la pile")
        XCTAssertFalse(connected.contains("CallRecordingOverlay("), "la bannière vit dans la pile")
        let stack = try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallTopBannerStackView.swift")
        XCTAssertTrue(stack.contains("CallTopBannerStack.ordered(present)"))
    }

    func test_liveFrameDisplay_isSuspended_onlyForASuspension() {
        XCTAssertFalse(CallLiveFrameDisplay.none.isSuspended)
    }

    // MARK: - #17732 — bandeau « Vous partagez · Arrêter » (P16.4, P16.6, P16.8, P16.11)

    func test_selfTileClearance_localShareShown_reservesTheBannerAndItsGap() {
        XCTAssertEqual(CallTopBannerStack.selfTileClearance(isLocalScreenShareShown: true), 52)
        XCTAssertEqual(
            CallTopBannerStack.selfTileClearance(isLocalScreenShareShown: true),
            CallTopBannerStack.headerRowClearance,
            "le bandeau (44) et l'écart (8) valent la hauteur de rangée d'en-tête : même pas que la pile"
        )
    }

    func test_selfTileClearance_noLocalShare_takesNoPlace() {
        XCTAssertEqual(CallTopBannerStack.selfTileClearance(isLocalScreenShareShown: false), 0)
    }

    func test_horizontalMargin_isTwelve_likeTheBoard() {
        XCTAssertEqual(CallTopBannerStack.horizontalMargin, 12)
    }

    func test_selfTile_reservesThePlaceOfTheLocalShareBanner() throws {
        let selfView = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+SelfView.swift")
        )
        XCTAssertTrue(selfView.contains("CallTopBannerStack.selfTileClearance(isLocalScreenShareShown: callManager.screenShare.isSharing)"))
    }

    func test_shareBanner_spansTheWidth_withStopAtTheTrailingEnd() throws {
        let controls = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallScreenShareControls.swift")
        )
        XCTAssertTrue(controls.contains("Spacer(minLength: 0)"), "Arrêter est posé à l'extrémité de fin")
        XCTAssertTrue(controls.contains(".frame(maxWidth: .infinity"), "le bandeau tient presque toute la largeur")
        let stack = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallTopBannerStackView.swift")
        )
        XCTAssertTrue(stack.contains(".padding(.horizontal, CallTopBannerStack.horizontalMargin)"))
    }

    func test_bannerStack_entersAndLeavesByTheTopEdge_andStowsWithTheChrome() throws {
        let stack = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallTopBannerStackView.swift")
        )
        XCTAssertTrue(stack.contains(".move(edge: .top)"), "le bandeau arrive du haut et repart vers lui")
        XCTAssertTrue(stack.contains(".transition(reduceMotion ? .opacity"), "Réduire les animations : fondu seul")
        XCTAssertTrue(stack.contains("CallEdgeStow(edge: .top"), "il se range vers son bord avec le chrome, comme l'en-tête")
        XCTAssertTrue(stack.contains("CallChromeStow.animation(reduceMotion: reduceMotion)"))
    }
}
