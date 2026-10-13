import XCTest
import CoreGraphics
import MeeshyUI
@testable import Meeshy

/// #10383 / #8916 — les lois du plein écran audio : l'ordre de réception, la
/// page suivante, la file que le lecteur partagé joue tant que l'écran est
/// ouvert, l'effacement du chrome, la disposition et l'offre d'actions.
@MainActor
final class AudioFullscreenRulesTests: XCTestCase {

    private struct Voice: Equatable {
        let id: String
        let receivedAt: Date
    }

    private func voice(_ id: String, at seconds: TimeInterval) -> Voice {
        Voice(id: id, receivedAt: Date(timeIntervalSince1970: 1_700_000_000 + seconds))
    }

    // MARK: - L'ordre de réception

    func test_ordered_sortsByReceptionTime_oldestFirst() {
        let voices = [voice("c", at: 30), voice("a", at: 10), voice("b", at: 20)]

        let ordered = AudioFullscreenSequence.ordered(voices, receivedAt: \.receivedAt)

        XCTAssertEqual(ordered.map(\.id), ["a", "b", "c"])
    }

    func test_ordered_sameReceptionTime_keepsArrivalOrder() {
        let voices = [voice("second", at: 10), voice("first", at: 0), voice("third", at: 10)]

        let ordered = AudioFullscreenSequence.ordered(voices, receivedAt: \.receivedAt)

        XCTAssertEqual(ordered.map(\.id), ["first", "second", "third"],
                       "deux vocaux d'un même message gardent leur ordre d'arrivée")
    }

    // MARK: - Suivant / précédent

    func test_next_returnsTheVoiceReceivedJustAfter() {
        XCTAssertEqual(AudioFullscreenSequence.next(after: "b", in: ["a", "b", "c"]), "c")
    }

    func test_next_atTheLastVoice_isNil() {
        XCTAssertNil(AudioFullscreenSequence.next(after: "c", in: ["a", "b", "c"]))
    }

    func test_next_forAnUnknownVoice_isNil() {
        XCTAssertNil(AudioFullscreenSequence.next(after: "z", in: ["a", "b"]))
    }

    func test_previous_returnsTheVoiceReceivedJustBefore() {
        XCTAssertEqual(AudioFullscreenSequence.previous(before: "b", in: ["a", "b", "c"]), "a")
    }

    func test_previous_atTheFirstVoice_isNil() {
        XCTAssertNil(AudioFullscreenSequence.previous(before: "a", in: ["a", "b", "c"]))
    }

    // MARK: - La file du lecteur partagé

    func test_upcoming_isEveryLaterVoice_listenedOnesIncluded() {
        XCTAssertEqual(AudioFullscreenSequence.upcoming(after: "b", in: ["a", "b", "c", "d"]), ["c", "d"])
    }

    func test_upcoming_atTheLastVoice_isEmpty() {
        XCTAssertEqual(AudioFullscreenSequence.upcoming(after: "d", in: ["a", "b", "c", "d"]), [])
    }

    // MARK: - La page suit la piste active

    func test_pageToFollow_whenTheSharedPlayerMovesToAnotherPage_followsIt() {
        let page = AudioFullscreenSequence.pageToFollow(activeAttachmentId: "c",
                                                        currentPageId: "b",
                                                        ids: ["a", "b", "c"])
        XCTAssertEqual(page, "c")
    }

    func test_pageToFollow_whenTheActiveTrackIsAlreadyThePage_isNil() {
        XCTAssertNil(AudioFullscreenSequence.pageToFollow(activeAttachmentId: "b",
                                                          currentPageId: "b",
                                                          ids: ["a", "b"]))
    }

    func test_pageToFollow_aTrackFromElsewhere_neverTurnsThePages() {
        XCTAssertNil(AudioFullscreenSequence.pageToFollow(activeAttachmentId: "other-conv",
                                                          currentPageId: "a",
                                                          ids: ["a", "b"]))
    }

    func test_pageToFollow_noActiveTrack_isNil() {
        XCTAssertNil(AudioFullscreenSequence.pageToFollow(activeAttachmentId: nil,
                                                          currentPageId: "a",
                                                          ids: ["a", "b"]))
    }

    // MARK: - Le chrome s'efface pendant l'écoute, jamais sous VoiceOver

    func test_autoHideDelay_whilePlaying_withChromeVisible_isTheSharedDelay() {
        let delay = AudioFullscreenChromeTiming.autoHideDelay(state: .initial,
                                                              isPlaying: true,
                                                              voiceOverRunning: false)
        XCTAssertEqual(delay, FullscreenChromeMetrics.autoHideDelay)
    }

    func test_autoHideDelay_paused_isNil() {
        XCTAssertNil(AudioFullscreenChromeTiming.autoHideDelay(state: .initial,
                                                               isPlaying: false,
                                                               voiceOverRunning: false))
    }

    func test_autoHideDelay_underVoiceOver_isNil() {
        XCTAssertNil(AudioFullscreenChromeTiming.autoHideDelay(state: .initial,
                                                               isPlaying: true,
                                                               voiceOverRunning: true))
    }

    func test_autoHideDelay_withReactionsOpen_isNil() {
        let open = FullscreenChromeState.initial.opening(.reactions)
        XCTAssertNil(AudioFullscreenChromeTiming.autoHideDelay(state: open,
                                                               isPlaying: true,
                                                               voiceOverRunning: false))
    }

    // MARK: - La disposition

    func test_layout_portraitPhone_isStacked_withinItsBounds() {
        let layout = AudioFullscreenLayout.resolve(for: CGSize(width: 393, height: 852))

        XCTAssertEqual(layout.arrangement, .stacked)
        XCTAssertGreaterThanOrEqual(layout.heroDiameter, AudioFullscreenLayout.minHero)
        XCTAssertLessThanOrEqual(layout.heroDiameter, AudioFullscreenLayout.maxHero)
    }

    func test_layout_landscapePhone_isSideBySide() {
        let layout = AudioFullscreenLayout.resolve(for: CGSize(width: 852, height: 393))
        XCTAssertEqual(layout.arrangement, .sideBySide)
    }

    func test_layout_smallPhone_neverShrinksBelowTheFloor() {
        let layout = AudioFullscreenLayout.resolve(for: CGSize(width: 300, height: 340))

        XCTAssertEqual(layout.heroDiameter, AudioFullscreenLayout.minHero)
        XCTAssertEqual(layout.transcriptMaxHeight, AudioFullscreenLayout.minTranscript)
    }

    func test_layout_landscapeIPad_staysStacked() {
        let layout = AudioFullscreenLayout.resolve(for: CGSize(width: 1194, height: 834))
        XCTAssertEqual(layout.arrangement, .stacked,
                       "un iPad en paysage a la hauteur d'empiler")
    }

    // MARK: - La vitesse

    func test_speed_next_advancesOneStep() {
        XCTAssertEqual(AudioFullscreenSpeed.next(after: .x1_0), .x1_25)
    }

    func test_speed_next_afterTheLastStep_returnsToNormal() {
        XCTAssertEqual(AudioFullscreenSpeed.next(after: .x2_0), .x1_0)
    }

    func test_speed_next_fromASpeedOutsideTheSteps_returnsToNormal() {
        XCTAssertEqual(AudioFullscreenSpeed.next(after: .x0_8), .x1_0)
    }

    func test_speed_previous_neverGoesBelowNormal() {
        XCTAssertEqual(AudioFullscreenSpeed.previous(before: .x1_5), .x1_25)
        XCTAssertEqual(AudioFullscreenSpeed.previous(before: .x1_0), .x1_0)
    }

    // MARK: - L'offre d'actions

    func test_offer_ordinaryVoiceWithKnownCarrier_offersAllThree() {
        let offer = AudioFullscreenOffer.resolve(isProtected: false, hasCarrier: true, composable: true)
        XCTAssertEqual(offer, AudioFullscreenOffer(react: true, reply: true, compose: true))
    }

    func test_offer_protectedVoice_offersNothing() {
        let offer = AudioFullscreenOffer.resolve(isProtected: true, hasCarrier: true, composable: true)
        XCTAssertTrue(offer.isEmpty, "une pièce protégée ne se cite, ne se réagit ni ne se recompose")
    }

    func test_offer_unknownCarrier_offersNothing() {
        let offer = AudioFullscreenOffer.resolve(isProtected: false, hasCarrier: false, composable: true)
        XCTAssertTrue(offer.isEmpty)
    }

    func test_offer_carrierThatMayNotBePublished_keepsReactAndReply() {
        let offer = AudioFullscreenOffer.resolve(isProtected: false, hasCarrier: true, composable: false)
        XCTAssertEqual(offer, AudioFullscreenOffer(react: true, reply: true, compose: false))
    }
}
