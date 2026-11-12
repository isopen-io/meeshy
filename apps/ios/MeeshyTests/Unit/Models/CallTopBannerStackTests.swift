import XCTest
@testable import Meeshy
import MeeshyUI

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

    // MARK: - #17791 — ma vignette descend sous la pile réelle des bandeaux (R1.6, R3.10)

    func test_selfTileClearance_noBanner_takesNoPlace() {
        XCTAssertEqual(CallTopBannerStack.selfTileClearance(counted: [], heights: [:]), 0)
    }

    func test_selfTileClearance_localShare_reservesTheBannerAndItsGap() {
        XCTAssertEqual(CallTopBannerStack.selfTileClearance(counted: [.screenShare], heights: [:]), 52)
        XCTAssertEqual(
            CallTopBannerStack.selfTileClearance(counted: [.screenShare], heights: [:]),
            CallTopBannerStack.headerRowClearance,
            "le bandeau (44) et l'écart (8) valent la hauteur de rangée d'en-tête : même pas que la pile"
        )
    }

    func test_selfTileClearance_recording_takesItsPlaceLikeTheOthers() {
        XCTAssertEqual(CallTopBannerStack.selfTileClearance(counted: [.recording], heights: [:]), 52)
    }

    func test_selfTileClearance_twoLineChip_followsTheMeasuredHeight() {
        XCTAssertEqual(CallTopBannerStack.selfTileClearance(counted: [.capture], heights: [.capture: 62]), 70)
    }

    func test_selfTileClearance_neverSinksBelowTheMinimumHeight() {
        XCTAssertEqual(CallTopBannerStack.selfTileClearance(counted: [.capture], heights: [.capture: 10]), 52)
    }

    func test_selfTileClearance_stackedBanners_addUpWithTheirGaps() {
        XCTAssertEqual(
            CallTopBannerStack.selfTileClearance(counted: [.screenShare, .recording, .capture], heights: [.capture: 62]),
            52 + 52 + 70
        )
    }

    func test_bannerGap_isTheStackSpacing() {
        XCTAssertEqual(CallTopBannerStack.bannerGap, MeeshySpacing.sm)
    }

    func test_countedForSelfTile_localShareRecordingAndCapture_areCounted() {
        XCTAssertEqual(
            CallTopBannerStack.countedForSelfTile(isLocalScreenShareShown: true, isRecordingShown: true, isCaptureAlertShown: true),
            [.screenShare, .recording, .capture]
        )
    }

    func test_countedForSelfTile_receivedShare_isNotCounted_17730() {
        XCTAssertEqual(
            CallTopBannerStack.countedForSelfTile(isLocalScreenShareShown: false, isRecordingShown: false, isCaptureAlertShown: false),
            []
        )
    }

    func test_horizontalMargin_isTwelve_likeTheBoard() {
        XCTAssertEqual(CallTopBannerStack.horizontalMargin, 12)
    }

    func test_selfTile_reservesThePlaceOfTheWholeStack() throws {
        let selfView = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+SelfView.swift")
        )
        XCTAssertTrue(selfView.contains("var selfTileTopBannerClearance: CGFloat"))
        XCTAssertTrue(selfView.contains("CallTopBannerStack.selfTileClearance(counted: counted, heights: topBannerHeights)"))
        XCTAssertTrue(selfView.contains("isRecordingShown: callManager.recording.phase != .idle || callManager.recording.notice != nil"))
        XCTAssertFalse(selfView.contains("CallCaptureAlertClearance"), "la capsule entre dans la loi de la pile")
    }

    func test_selfTile_followsTheStackInMotion_andFitsUnderIt() throws {
        let selfView = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+SelfView.swift")
        )
        XCTAssertEqual(
            selfView.components(separatedBy: "clearance: selfTileTopBannerClearance, reduceMotion: reduceMotion))").count - 1,
            2,
            "la vignette vivante ET la tuile « vidéo en pause » suivent la pile, en mouvement"
        )
        XCTAssertTrue(
            selfView.contains("- QualityThresholds.pipTopClearance - QualityThresholds.pipBottomClearance - selfTileTopBannerClearance"),
            "la place réservée à la pile se déduit de la hauteur où la vignette se borne : elle ne passe pas sous la pilule"
        )
        let glass = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallControlGlass.swift")
        )
        XCTAssertTrue(glass.contains("struct CallSelfTilePlacement: ViewModifier {"))
        XCTAssertTrue(glass.contains(".position(position)"))
        XCTAssertTrue(
            glass.contains(".animation(reduceMotion ? nil : CallChromeStow.animation(reduceMotion: false), value: clearance)"),
            "elle glisse avec la pile, pour chaque bandeau ; Réduire les animations : elle se pose sans mouvement"
        )
    }

    func test_stackHeight_isMeasuredByTheBanners_andReadByTheCallScreen() throws {
        let share = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallScreenShareControls.swift"))
        let capture = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallCaptureViews.swift"))
        let screen = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView.swift"))
        XCTAssertTrue(share.contains(".reportsTopBannerHeight(.screenShare)"))
        XCTAssertTrue(capture.contains(".reportsTopBannerHeight(.capture)"), "une puce à deux lignes ne recouvre pas la vignette")
        XCTAssertTrue(screen.contains(".onPreferenceChange(CallTopBannerHeightsKey.self)"))
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

    /// Loi 18 (`docs/product/appels-vue-finale.md`) — le bandeau de partage porte
    /// le verre dessiné `adaptiveLiquidGlass`, comme l'en-tête et les boutons d'appel ;
    /// `adaptiveGlass` n'en donne qu'un matériau nu sous iOS 16 à 25.
    func test_shareBanner_usesTheDrawnLiquidGlassAtom_likeHeaderAndCallButtons() throws {
        let controls = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallScreenShareControls.swift")
        )
        XCTAssertTrue(
            controls.contains(".adaptiveLiquidGlass(in: Capsule(), tint: MeeshyColors.error.opacity(MeeshyOpacity.medium), interactive: showsStop)"),
            "le bandeau porte le verre dessiné de la loi 18 : reflet, liseré, ombre sous iOS 16 à 25"
        )
        XCTAssertFalse(controls.contains(".adaptiveGlass("), "adaptiveGlass : matériau nu sous iOS 16 à 25, pas le verre de la loi 18")
    }
}
