import XCTest
@testable import Meeshy

/// **Dans la conversation de l'appel, la puce d'en-tête suffit** (#18457,
/// directive porteur du 2026-11-14) : le bandeau et la bulle s'y taisent en
/// audio, la vignette vidéo y prend leur place en vidéo. Ailleurs, rien ne
/// change ; le plein écran et le PiP système gardent la main.
@MainActor
final class CallReducedPresenceTests: XCTestCase {

    private func presence(
        _ mode: CallDisplayMode,
        isActive: Bool = true,
        systemPiP: Bool = false,
        inConversation: Bool = false,
        video: Bool = false
    ) -> CallReducedPresence {
        CallReducedPresence.resolve(
            displayMode: mode, isActive: isActive, isSystemPiPActive: systemPiP,
            isInCallConversation: inConversation, isVideo: video
        )
    }

    // MARK: - Hors de la conversation de l'appel : rien ne change

    func test_elsewhere_pipModeShowsThePill_bubbleModeShowsTheBubble() {
        XCTAssertEqual(presence(.pip), .pill)
        XCTAssertEqual(presence(.bubble), .bubble)
        XCTAssertEqual(presence(.pip, video: true), .pill, "la vidéo n'ouvre la vignette que DANS la conversation de l'appel")
    }

    func test_fullScreenSystemPiPOrNoCall_showNothingReduced() {
        XCTAssertEqual(presence(.fullScreen), .none)
        XCTAssertEqual(presence(.pip, systemPiP: true), .none, "le PiP système est lui-même le point de retour")
        XCTAssertEqual(presence(.bubble, isActive: false), .none)
        XCTAssertEqual(presence(.pip, isActive: true, inConversation: true, video: true), .vignette)
        XCTAssertEqual(presence(.pip, systemPiP: true, inConversation: true, video: true), .none)
    }

    // MARK: - Dans la conversation de l'appel

    func test_inTheCallConversation_audioLeavesOnlyTheHeaderChip() {
        XCTAssertEqual(presence(.pip, inConversation: true), .headerOnly)
        XCTAssertEqual(presence(.bubble, inConversation: true), .headerOnly, "la bulle se tait aussi : la puce est déjà là")
    }

    func test_inTheCallConversation_videoBecomesTheFloatingVignette() {
        XCTAssertEqual(presence(.pip, inConversation: true, video: true), .vignette)
        XCTAssertEqual(presence(.bubble, inConversation: true, video: true), .vignette)
    }

    // MARK: - Qui est « la conversation de l'appel »

    func test_isInCallConversation_requiresBothIdsAndEquality() {
        XCTAssertTrue(CallReducedPresence.isInCallConversation(visibleConversationId: "c1", callConversationId: "c1"))
        XCTAssertFalse(CallReducedPresence.isInCallConversation(visibleConversationId: "c2", callConversationId: "c1"))
        XCTAssertFalse(CallReducedPresence.isInCallConversation(visibleConversationId: nil, callConversationId: "c1"), "aucune conversation à l'écran")
        XCTAssertFalse(CallReducedPresence.isInCallConversation(visibleConversationId: "c1", callConversationId: nil), "un appel sans conversation connue n'est celle d'aucun écran")
    }

    // MARK: - La vignette ne descend jamais au cercle

    func test_effectiveTier_vignetteLiftsTheCircleToSmall_andKeepsAnyOtherChoice() {
        XCTAssertEqual(CallReducedPresence.effectiveTier(stored: .circle, presence: .vignette), .small)
        XCTAssertEqual(CallReducedPresence.effectiveTier(stored: .medium, presence: .vignette), .medium)
        XCTAssertEqual(CallReducedPresence.effectiveTier(stored: .circle, presence: .bubble), .circle, "hors de la conversation de l'appel, le palier choisi au pincement reste")
    }

    // MARK: - Les deux portes passent par la loi

    func test_thePill_isSilentInTheCallConversation_unlessNothingChanged() {
        XCTAssertTrue(FloatingCallPillView.isShowingPill(displayMode: .pip, callState: .connected, isSystemPiPActive: false))
        XCTAssertFalse(FloatingCallPillView.isShowingPill(
            displayMode: .pip, callState: .connected, isSystemPiPActive: false, isInCallConversation: true
        ))
        XCTAssertFalse(FloatingCallPillView.isShowingPill(
            displayMode: .pip, callState: .connected, isSystemPiPActive: false, isInCallConversation: true, isVideo: true
        ), "en vidéo c'est la vignette, pas le bandeau")
    }

    func test_theBubble_hidesForAudioInTheCallConversation_andShowsTheVignetteForVideo() {
        XCTAssertFalse(CallReturnPoint.showsBubble(
            displayMode: .bubble, callState: .connected, isSystemPiPActive: false, isMainScreenCovered: false,
            isInCallConversation: true
        ))
        XCTAssertTrue(CallReturnPoint.showsBubble(
            displayMode: .pip, callState: .connected, isSystemPiPActive: false, isMainScreenCovered: false,
            isInCallConversation: true, isVideo: true
        ), "la vignette remplace le bandeau, même sans plein écran qui le recouvre")
        XCTAssertTrue(CallReturnPoint.showsBubble(
            displayMode: .bubble, callState: .connected, isSystemPiPActive: false, isMainScreenCovered: false
        ), "ailleurs, la bulle reste la bulle")
    }
}
