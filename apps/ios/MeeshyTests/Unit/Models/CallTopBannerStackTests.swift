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

    // MARK: - #17833 — en groupe, la grille cède sa place à la pile (L4.11)

    func test_groupGridClearance_noBanner_takesNoPlace() {
        XCTAssertEqual(CallTopBannerStack.groupGridClearance(present: [], heights: [:], isStageFullScreen: false), 0)
    }

    func test_groupGridClearance_isTheSamePlaceAsMySelfTile_forTheSameBanners() {
        let heights: [CallTopBanner: CGFloat] = [.capture: 62]
        XCTAssertEqual(
            CallTopBannerStack.groupGridClearance(present: [.screenShare, .recording, .capture], heights: heights, isStageFullScreen: false),
            CallTopBannerStack.selfTileClearance(counted: [.screenShare, .recording, .capture], heights: heights),
            "UNE loi pour la pile : la grille et ma vignette de duo lui cèdent la même place"
        )
    }

    func test_groupGridClearance_countsAReceivedShareAndTheLiveFrame() {
        XCTAssertEqual(CallTopBannerStack.groupGridClearance(present: [.screenShare, .liveFrame], heights: [:], isStageFullScreen: false), 52 + 52)
    }

    func test_groupGridClearance_fullScreenStage_takesNoPlace_theBannersAreStowed() {
        XCTAssertEqual(
            CallTopBannerStack.groupGridClearance(present: [.screenShare, .recording, .capture], heights: [.capture: 62], isStageFullScreen: true),
            0,
            "plein écran : la scène prend tout l'écran, la pile rangée ne lui laisse pas de bande vide"
        )
    }

    func test_present_gathersEveryBannerOfTheStack() {
        XCTAssertEqual(
            CallTopBannerStack.present(isScreenShareShown: true, isRecordingShown: true, isCaptureAlertShown: true, isLiveFrameShown: true),
            [.screenShare, .recording, .capture, .liveFrame]
        )
        XCTAssertEqual(CallTopBannerStack.present(isScreenShareShown: false, isRecordingShown: false, isCaptureAlertShown: false, isLiveFrameShown: false), [])
    }

    func test_groupGrid_yieldsToTheStack_inMotion() throws {
        let connected = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+Connected.swift")
        )
        let layout = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private var groupStageLayout: some View", in: connected))
        XCTAssertTrue(layout.contains("CallGroupStageTopReserve("), "la réserve haute de la grille compte la pile mesurée")
        XCTAssertTrue(layout.contains("heights: topBannerHeights"))
        XCTAssertTrue(layout.contains("isStageFullScreen: isStageFullScreen"), "plein écran : la réserve ne compte plus la pile rangée")
        let reserve = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Models/CallTopBannerHeights.swift")
        )
        XCTAssertTrue(reserve.contains(".frame(height: base + clearance)"))
        XCTAssertTrue(
            reserve.contains(".animation(CallChromeStow.animation(reduceMotion: reduceMotion), value: clearance)"),
            "la grille glisse avec la pile ; Réduire les animations : un fondu court"
        )
        XCTAssertTrue(reserve.contains("CallTopBannerStack.groupGridClearance("))
        XCTAssertTrue(reserve.contains("isStageFullScreen: isStageFullScreen"))
    }

    func test_bannerStack_andGroupGrid_readThePresenceFromTheSameLaw() throws {
        let stack = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallTopBannerStackView.swift"))
        XCTAssertTrue(stack.contains("CallTopBannerStack.present("), "la pile et la grille lisent UNE présence")
        XCTAssertFalse(stack.contains("present.insert("), "aucune jumelle de la présence dans la vue de la pile")
        let reserve = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Models/CallTopBannerHeights.swift"))
        XCTAssertTrue(reserve.contains("CallTopBannerStack.present("))
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
            glass.contains(".animation(nil, value: clearance)") && glass.contains("clock.following(from: old.position, to: new.position, at: Date(), reduceMotion: reduceMotion)"),
            "elle glisse avec la pile, pour chaque bandeau, par une translation (loi 17.2) ; Réduire les animations : un fondu court (#18207)"
        )
    }

    func test_stackHeight_isMeasuredByTheBanners_andReadByTheCallScreen() throws {
        let share = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallScreenShareControls.swift"))
        let capture = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallCaptureViews.swift"))
        let recording = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallRecordingControls.swift"))
        let screen = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView.swift"))
        XCTAssertTrue(share.contains(".modifier(CallTopBannerHeightReporter(banner: .screenShare))"))
        XCTAssertTrue(capture.contains(".modifier(CallTopBannerHeightReporter(banner: .capture))"), "une puce à deux lignes ne recouvre pas la vignette")
        XCTAssertTrue(
            recording.contains(".modifier(CallTopBannerHeightReporter(banner: .recording))"),
            "la carte d'accord, la capsule (attente puis enregistrement) et l'avis à deux lignes rendent leur hauteur : la vignette descend sous la vraie capsule"
        )
        let stack = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallTopBannerStackView.swift"))
        let live = try XCTUnwrap(stack.range(of: "case .liveFrame:"))
        XCTAssertTrue(
            String(stack[live.upperBound...]).contains(".modifier(CallTopBannerHeightReporter(banner: .liveFrame))"),
            "le cadre en direct rend sa hauteur : une carte à deux lignes ne passe pas sur la grille"
        )
        XCTAssertTrue(screen.contains(".onPreferenceChange(CallTopBannerHeightsKey.self)"))
        let key = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Models/CallTopBannerHeights.swift"))
        XCTAssertTrue(key.contains("nonisolated struct CallTopBannerHeightsKey: PreferenceKey"), "la cible isole sur le MainActor par défaut ; la clé reste hors acteur, comme les autres clés de l'appel")
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
    // MARK: - #17815 — la carte du cadre en direct : duo vidéo seulement, marge de la pile (C2.10, C2.1)

    func test_mayShowProposal_videoDuo_isShown() {
        XCTAssertTrue(CallLiveFrameRule.mayShowProposal(participants: CallLiveFrameRule.people, showsVideo: true, isGroupStage: false))
    }

    func test_mayShowProposal_audioDuo_isHidden() {
        XCTAssertFalse(CallLiveFrameRule.mayShowProposal(participants: CallLiveFrameRule.people, showsVideo: false, isGroupStage: false))
    }

    func test_mayShowProposal_groupStageWithTwoConnected_isHidden() {
        XCTAssertFalse(CallLiveFrameRule.mayShowProposal(participants: CallLiveFrameRule.people, showsVideo: true, isGroupStage: true))
    }

    func test_mayShowProposal_morePeopleThanADuo_isHidden() {
        XCTAssertFalse(CallLiveFrameRule.mayShowProposal(participants: CallLiveFrameRule.people + 1, showsVideo: true, isGroupStage: false))
    }

    func test_liveFrameStatus_proposalIsGatedByTheDuoVideoLaw_notByTheCatalogueAlone() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+LiveFrame.swift"))
        let status = try XCTUnwrap(DeclarationBodyScanner.body(containing: "var hasLiveFrameStatus: Bool", in: source))
        XCTAssertTrue(status.contains("offersLiveFrame &&"), "la proposition ne se compte que si le duo vidéo l'offre")
        let view = try XCTUnwrap(DeclarationBodyScanner.body(containing: "var liveFrameStatus: some View", in: source))
        XCTAssertTrue(view.contains("if offersLiveFrame, let proposal"), "la carte n'est montrée qu'en duo vidéo")
    }

    func test_liveFrameBanner_holdsTheStackLateralMargin_likeTheOtherBanners() throws {
        let stack = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallTopBannerStackView.swift"))
        let live = try XCTUnwrap(stack.range(of: "case .liveFrame:"))
        let tail = String(stack[live.upperBound...])
        XCTAssertTrue(tail.contains(".padding(.horizontal, CallTopBannerStack.horizontalMargin)"))
        XCTAssertFalse(tail.contains("MeeshySpacing.lg"), "P16.4 : la marge de la pile, celle du bandeau de partage")
    }
}

/// #17965 (L1.8, L6) — en paysage, la pile des bannières a la borne de la pilule (560), centrée,
/// et ma vignette garde son coin à côté d'elle tant que la pile, resserrée pour la laisser, reste
/// lisible. En portrait, rien ne change : la pile tient la largeur et ma vignette descend dessous.
/// Vecteurs (pt) partagés avec Android et le web.
@MainActor
final class CallTopBannerSpanTests: XCTestCase {

    private let phoneLandscape = CGSize(width: 852, height: 393)
    private let phonePortrait = CGSize(width: 393, height: 852)
    private let padLandscape = CGSize(width: 1194, height: 834)

    func test_landscapeMaxWidth_isThePillBound() {
        XCTAssertEqual(CallTopBannerStack.landscapeMaxWidth, 560)
        XCTAssertEqual(CallTopBannerStack.landscapeMaxWidth, CallPillWidth.text)
    }

    func test_portrait_keepsTheWholeWidth_andTheTileGoesUnder() {
        let span = CallTopBannerStack.span(window: phonePortrait, safeHorizontal: 0, selfTile: CallTopBannerTileNeighbor(width: 100, edgeDistance: 16))
        XCTAssertNil(span.bannerMaxWidth)
        XCTAssertFalse(span.keepsSelfTileBeside)
        XCTAssertEqual(span.stackMaxWidth, .infinity)
    }

    func test_landscape_withoutTile_isBoundedTo560() {
        let span = CallTopBannerStack.span(window: phoneLandscape, safeHorizontal: 59, selfTile: nil)
        XCTAssertEqual(span.bannerMaxWidth, 560)
        XCTAssertFalse(span.keepsSelfTileBeside)
        XCTAssertEqual(span.stackMaxWidth, 560 + 2 * CallTopBannerStack.horizontalMargin)
    }

    func test_landscape_tileAtTheTop_keepsItsCornerBesideTheStack() {
        let span = CallTopBannerStack.span(window: phoneLandscape, safeHorizontal: 59, selfTile: CallTopBannerTileNeighbor(width: 130, edgeDistance: 16))
        XCTAssertEqual(span.bannerMaxWidth, 544)
        XCTAssertTrue(span.keepsSelfTileBeside)
    }

    func test_landscape_railsOpen_theStackNarrowsAgainForTheTile() {
        let span = CallTopBannerStack.span(window: phoneLandscape, safeHorizontal: 59, selfTile: CallTopBannerTileNeighbor(width: 130, edgeDistance: 135))
        XCTAssertEqual(span.bannerMaxWidth, 306)
        XCTAssertTrue(span.keepsSelfTileBeside)
    }

    func test_landscape_tooNarrowBeside_theTileGoesUnder_andTheStackTakes560() {
        let span = CallTopBannerStack.span(window: phoneLandscape, safeHorizontal: 59, selfTile: CallTopBannerTileNeighbor(width: 195, edgeDistance: 135))
        XCTAssertEqual(span.bannerMaxWidth, 560)
        XCTAssertFalse(span.keepsSelfTileBeside)
    }

    func test_padLandscape_tileBeside_stackAt560() {
        let span = CallTopBannerStack.span(window: padLandscape, safeHorizontal: 0, selfTile: CallTopBannerTileNeighbor(width: 130, edgeDistance: 16))
        XCTAssertEqual(span.bannerMaxWidth, 560)
        XCTAssertTrue(span.keepsSelfTileBeside)
    }

    func test_minimumWidth_holdsTheShareBannerAndItsStop() {
        XCTAssertGreaterThanOrEqual(CallTopBannerStack.landscapeMinimumWidth, 300)
    }

    func test_stackView_isBoundedAndCentred_inMotion() throws {
        let stack = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallTopBannerStackView.swift"))
        XCTAssertTrue(stack.contains("CallTopBannerStack.span(window: geo.size, safeHorizontal: safeHorizontal, selfTile: selfTile)"))
        XCTAssertTrue(stack.contains(".frame(maxWidth: span.stackMaxWidth)"))
        XCTAssertTrue(stack.contains(".animation(CallChromeStow.animation(reduceMotion: reduceMotion), value: span)"))
        let connected = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+Connected.swift"))
        XCTAssertTrue(connected.contains("safeHorizontal: Self.railsSafeHorizontal, selfTile: selfTileBannerNeighbor"))
    }

    func test_selfTile_keepsItsCorner_whenTheStackLeavesItBeside() throws {
        let selfView = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+SelfView.swift"))
        let clearance = try XCTUnwrap(DeclarationBodyScanner.body(containing: "var selfTileTopBannerClearance: CGFloat", in: selfView))
        XCTAssertTrue(clearance.contains("CallTopBannerStack.span(window: DeviceLayout.windowSize, safeHorizontal: Self.railsSafeHorizontal, selfTile: selfTileBannerNeighbor).keepsSelfTileBeside"))
        XCTAssertTrue(selfView.contains("var selfTileBannerNeighbor: CallTopBannerTileNeighbor?"))
    }

    // MARK: - Ma vignette vue de la pile

    func test_duoTile_atATopCorner_isSeenWithItsMargin() {
        XCTAssertEqual(CallTopBannerTileNeighbor.duoTile(isShown: true, isAtTop: true, width: 130, ownInset: 16, safeHorizontal: 59, railsShown: false), CallTopBannerTileNeighbor(width: 130, edgeDistance: 16))
    }

    func test_duoTile_railsOpen_isSeenAgainstTheRail() {
        XCTAssertEqual(CallTopBannerTileNeighbor.duoTile(isShown: true, isAtTop: true, width: 130, ownInset: 16, safeHorizontal: 59, railsShown: true), CallTopBannerTileNeighbor(width: 130, edgeDistance: 135))
    }

    func test_duoTile_atTheBottom_orHidden_leavesTheStackAlone() {
        XCTAssertNil(CallTopBannerTileNeighbor.duoTile(isShown: true, isAtTop: false, width: 130, ownInset: 16, safeHorizontal: 59, railsShown: false))
        XCTAssertNil(CallTopBannerTileNeighbor.duoTile(isShown: false, isAtTop: true, width: 130, ownInset: 16, safeHorizontal: 59, railsShown: false))
    }

    // MARK: - #17963 — la puce de capture : verre teinté rouge, 5 s, rangée avec les bannières (R1.2, R1.4, R1.6)

    private static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }

    private func kitMilliseconds(_ name: String) throws -> Double {
        let source = try String(contentsOf: Self.repoRoot.appendingPathComponent("packages/shared/types/call-capture.ts"), encoding: .utf8)
        let regex = try NSRegularExpression(pattern: "export const \(name) = ([0-9_]+);")
        let match = try XCTUnwrap(regex.firstMatch(in: source, range: NSRange(source.startIndex..., in: source)), "\(name) introuvable dans le kit")
        let literal = try XCTUnwrap(Range(match.range(at: 1), in: source).map { String(source[$0]) })
        return try XCTUnwrap(Double(literal.replacingOccurrences(of: "_", with: "")))
    }

    /// R1.4 — une capture ponctuelle tient la puce le temps du kit partagé, 5 s, comme Android et
    /// le web ; la passerelle relaie sa fin synthétique au même terme. Le témoin lit la constante
    /// du kit : elle ne peut plus diverger en silence.
    func test_captureChip_lastsTheKitScreenshotAlertTTL() throws {
        let ttl = try kitMilliseconds("CALL_SCREENSHOT_ALERT_TTL_MS")
        XCTAssertEqual(ttl, 5_000)
        XCTAssertEqual(CallCaptureAlertCapsule.transientSeconds * 1_000, ttl, "la puce dure CALL_SCREENSHOT_ALERT_TTL_MS")
    }

    /// R1.2 — la puce porte le verre teinté rouge du kit, celui du bandeau de partage : plus
    /// d'aplat rouge. L'atome du kit directement (`meeshyGlass`, ton `theme`), que le cliquet
    /// `kit-glass-call` ne compte pas. L'anneau blanc puis la phrase, aucun bouton, 44 pt de
    /// haut, une seule annonce pour VoiceOver.
    func test_captureChip_wearsTheKitRedTintedGlass_likeTheShareBanner() throws {
        let views = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallCaptureViews.swift"))
        let capsule = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private func capsule(_ text: String) -> some View", in: views))
        XCTAssertTrue(
            capsule.contains(".meeshyGlass(in: Capsule(), tone: .theme, tint: MeeshyColors.error.opacity(MeeshyOpacity.medium))"),
            "le verre teinté rouge du kit, la recette même de « Vous partagez votre écran » (adaptiveLiquidGlass y renvoie)"
        )
        XCTAssertFalse(capsule.contains("isInteractive: true"), "rien à toucher : un verre au repos")
        XCTAssertFalse(capsule.contains(".background(MeeshyColors.error"), "plus d'aplat rouge")
        XCTAssertFalse(capsule.contains("Button("), "la puce n'a aucun bouton")
        XCTAssertTrue(capsule.contains(".stroke(Color.white, lineWidth: MeeshyBorder.strong)"), "l'anneau blanc reste")
        XCTAssertTrue(capsule.contains(".frame(minHeight: 44)"))
        XCTAssertTrue(capsule.contains(".accessibilityElement(children: .ignore)"))
        XCTAssertTrue(capsule.contains(".modifier(CallTopBannerHeightReporter(banner: .capture))"), "la pile mesure toujours sa hauteur")
    }

    /// R1.6 — au premier toucher, la puce sort par le haut AVEC les bannières (loi 11) et revient
    /// au second ; « Réduire les animations » : un fondu. Sa minuterie de 5 s court pendant qu'elle
    /// est rangée : la ranger ne la prolonge pas.
    func test_captureChip_stowsByTheTopEdge_withTheBanners() throws {
        let stack = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallTopBannerStackView.swift"))
        let capture = try XCTUnwrap(stack.range(of: "case .capture:").map { String(stack[$0.upperBound...]) })
        let branch = try XCTUnwrap(capture.components(separatedBy: "case .liveFrame:").first)
        XCTAssertTrue(branch.contains("CallCaptureAlertCapsule(alert: captureJournal.alert, onDismiss: captureJournal.dismissFlash)"), "rien ne change de ce qui la nourrit")
        XCTAssertTrue(branch.contains(".modifier(CallEdgeStow(edge: .top, margin: topInset, isVisible: chrome.isVisible(.captureAlert), reduceMotion: reduceMotion))"))
        XCTAssertTrue(branch.contains(".callChromeVisibility(chrome.isVisible(.captureAlert))"))
    }
}

/// P11.1 (#18206) — en groupe, l'en-tête FLOTTE sur la grille : en portrait, la grille part du haut
/// de la zone sûre et Réduire · Image dans l'image · Conversation et la capsule se posent sur les
/// vignettes du haut, comme la planche P11. La pilule, elle, reste dans le flux (#17949, A) : la
/// grille se resserre au-dessus d'elle. Ce qui garde sa réserve sous l'en-tête : la hauteur compacte
/// (L4, #17885 : la rangée de quatre entre l'en-tête et la pilule), la une (P14, sa capsule et la puce
/// d'écran se posent au haut de sa vignette) et une pile de bandeaux (L4.11, #17833 : la grille ne
/// passe jamais sous un bandeau).
@MainActor
final class CallGroupHeaderFloatTests: XCTestCase {

    func test_headerFloats_overThePortraitGrid() {
        XCTAssertTrue(CallTopBannerStack.headerFloatsOverGroupStage(isGrid: true, isCompactHeight: false))
    }

    func test_headerDoesNotFloat_overACompactHeightRow_L4() {
        XCTAssertFalse(
            CallTopBannerStack.headerFloatsOverGroupStage(isGrid: true, isCompactHeight: true),
            "L4 (#17885) : en hauteur compacte, aucune vignette ne passe sous l'en-tête"
        )
    }

    func test_headerDoesNotFloat_overTheFeaturedTile_P14() {
        XCTAssertFalse(
            CallTopBannerStack.headerFloatsOverGroupStage(isGrid: false, isCompactHeight: false),
            "P14 : la capsule de la une se pose au haut de sa vignette, jamais sous celle de l'en-tête"
        )
    }

    func test_floatingHeader_startsTheGridAtTheSafeArea() {
        XCTAssertEqual(
            CallTopBannerStack.groupStageTopBase(safeAreaTop: 59, chromeTopInset: 67, stageSpacing: 8, headerFloats: true, hasBanners: false, isStageFullScreen: false),
            59 - 8,
            "après l'espacement de la scène, la grille part de la zone sûre, 8 pt au-dessus de la rangée d'en-tête (planche P11)"
        )
    }

    func test_floatingHeader_onAWindowWithoutSafeArea_neverReservesANegativeBand() {
        XCTAssertEqual(
            CallTopBannerStack.groupStageTopBase(safeAreaTop: 0, chromeTopInset: 8, stageSpacing: 8, headerFloats: true, hasBanners: false, isStageFullScreen: false),
            0
        )
    }

    func test_reservedHeader_keepsTheStageUnderTheHeaderRow() {
        XCTAssertEqual(
            CallTopBannerStack.groupStageTopBase(safeAreaTop: 59, chromeTopInset: 67, stageSpacing: 8, headerFloats: false, hasBanners: false, isStageFullScreen: false),
            67 + 52
        )
    }

    func test_aBanner_pushesTheGridUnderTheStack_evenWhenTheHeaderFloats() {
        XCTAssertEqual(
            CallTopBannerStack.groupStageTopBase(safeAreaTop: 59, chromeTopInset: 67, stageSpacing: 8, headerFloats: true, hasBanners: true, isStageFullScreen: false),
            CallTopBannerStack.topInset(chromeTopInset: 67),
            "L4.11 (#17833) : la pile se pose sous l'en-tête, la grille lui cède sa place"
        )
    }

    /// #18227 — une pastille de service (« En attente », « Vidéo réduite ») est un bandeau de la pile :
    /// l'en-tête ne flotte plus et la grille lui cède sa place.
    func test_aServicePill_countsAsABanner_theHeaderStopsFloating() {
        let present = CallTopBannerStack.present(isScreenShareShown: false, isRecordingShown: false, isCaptureAlertShown: false, isLiveFrameShown: false, service: [.hold])
        XCTAssertFalse(present.isEmpty)
        XCTAssertEqual(
            CallTopBannerStack.groupStageTopBase(safeAreaTop: 59, chromeTopInset: 67, stageSpacing: 8, headerFloats: true, hasBanners: !present.isEmpty, isStageFullScreen: false),
            CallTopBannerStack.topInset(chromeTopInset: 67)
        )
    }

    func test_fullScreenStage_startsAtTheSafeArea_floatingOrNot() {
        for floats in [true, false] {
            XCTAssertEqual(
                CallTopBannerStack.groupStageTopBase(safeAreaTop: 59, chromeTopInset: 67, stageSpacing: 8, headerFloats: floats, hasBanners: false, isStageFullScreen: true),
                59
            )
        }
    }

    func test_groupStage_floatsTheHeaderFromTheGridFocus_andMovesWithIt() throws {
        let connected = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+Connected.swift"))
        let layout = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private var groupStageLayout: some View", in: connected))
        XCTAssertTrue(
            layout.contains("headerFloats: CallTopBannerStack.headerFloatsOverGroupStage(isGrid: groupStageFocus == .grid, isCompactHeight: isStageCompactHeight)"),
            "la loi pure décide, depuis ce qui est à la une et la hauteur de la scène"
        )
        XCTAssertFalse(layout.contains("Self.chromeTopInset + 52"), "plus de bande réservée en dur au-dessus de la grille")
        XCTAssertTrue(layout.contains("safeAreaTop: DeviceLayout.safeAreaTop, chromeTopInset: Self.chromeTopInset"))
        let reserve = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Models/CallTopBannerHeights.swift"))
        XCTAssertTrue(reserve.contains("CallTopBannerStack.groupStageTopBase("))
        XCTAssertTrue(reserve.contains("hasBanners: !present.isEmpty"), "les pastilles de service comptent : la présence vient de la pile")
        XCTAssertTrue(reserve.contains("service: service"))
        XCTAssertTrue(
            reserve.contains(".animation(CallChromeStow.animation(reduceMotion: reduceMotion), value: base)"),
            "grille ↔ une : la scène glisse sous l'en-tête, jamais d'un coup ; Réduire les animations : un fondu court"
        )
    }
}
