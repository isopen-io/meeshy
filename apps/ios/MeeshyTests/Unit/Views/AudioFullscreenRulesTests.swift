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

    /// #10568 — la piste que l'écran vient de demander ne le ramène pas en
    /// arrière : seule une piste que le LECTEUR a choisie fait tourner les pages.
    func test_pageToFollow_theTrackTheScreenJustRequested_neverPullsItBack() {
        XCTAssertNil(AudioFullscreenSequence.pageToFollow(activeAttachmentId: "b",
                                                          currentPageId: "c",
                                                          ids: ["a", "b", "c"],
                                                          requestedByScreen: "b"))
    }

    func test_pageToFollow_aTrackThePlayerChose_isFollowedEvenAfterAScreenRequest() {
        let page = AudioFullscreenSequence.pageToFollow(activeAttachmentId: "c",
                                                        currentPageId: "b",
                                                        ids: ["a", "b", "c"],
                                                        requestedByScreen: "b")
        XCTAssertEqual(page, "c")
    }

    // MARK: - Ce qu'un balayage coûte (#10568)

    func test_paging_rendersThePageAndItsTwoNeighbours_nothingBeyond() {
        XCTAssertTrue(AudioFullscreenPaging.renders(index: 4, current: 4))
        XCTAssertTrue(AudioFullscreenPaging.renders(index: 3, current: 4))
        XCTAssertTrue(AudioFullscreenPaging.renders(index: 5, current: 4))
        XCTAssertFalse(AudioFullscreenPaging.renders(index: 2, current: 4))
        XCTAssertFalse(AudioFullscreenPaging.renders(index: 6, current: 4))
    }

    func test_paging_theEntryPagePlaysAtOnce_aTurnedPageWaitsToSettle() {
        XCTAssertEqual(AudioFullscreenPaging.playbackDelay(turnedTo: false), 0)
        XCTAssertEqual(AudioFullscreenPaging.playbackDelay(turnedTo: true), AudioFullscreenPaging.settleDelay)
        XCTAssertGreaterThan(AudioFullscreenPaging.settleDelay, 0)
        XCTAssertLessThanOrEqual(AudioFullscreenPaging.settleDelay, 0.2, "au-delà, la piste paraît en retard sur la page")
    }

    // MARK: - Fermer d'un glissement ne dispute pas le balayage (#10568)

    func test_dismiss_armsOnlyForAFrankDownwardDrag() {
        XCTAssertTrue(AudioFullscreenDismissRule.arms(velocity: CGVector(dx: 40, dy: 300)))
        XCTAssertFalse(AudioFullscreenDismissRule.arms(velocity: CGVector(dx: 300, dy: 40)), "un balayage de page")
        XCTAssertFalse(AudioFullscreenDismissRule.arms(velocity: CGVector(dx: 250, dy: 300)), "un balayage en biais reste un balayage")
        XCTAssertFalse(AudioFullscreenDismissRule.arms(velocity: CGVector(dx: 0, dy: -300)), "vers le haut")
    }

    func test_dismiss_aGentleDrag_closesOnlyPastHalfTheScreen() {
        XCTAssertFalse(AudioFullscreenDismissRule.dismisses(translation: 130, velocity: 200, height: 900), "l'ancien seuil ne suffit plus")
        XCTAssertFalse(AudioFullscreenDismissRule.dismisses(translation: 440, velocity: 0, height: 900))
        XCTAssertTrue(AudioFullscreenDismissRule.dismisses(translation: 450, velocity: 0, height: 900))
    }

    func test_dismiss_aBriefFastFlick_closesAtOnce() {
        XCTAssertTrue(AudioFullscreenDismissRule.dismisses(translation: 60, velocity: 1_800, height: 900))
        XCTAssertFalse(AudioFullscreenDismissRule.dismisses(translation: 60, velocity: 900, height: 900), "rapide mais pas un coup sec")
        XCTAssertFalse(AudioFullscreenDismissRule.dismisses(translation: 10, velocity: 3_000, height: 900), "un sursaut sans course")
    }

    func test_dismiss_draggingBackUp_cancels() {
        XCTAssertFalse(AudioFullscreenDismissRule.dismisses(translation: 80, velocity: -1_200, height: 900))
    }

    // MARK: - Une page au repos garde son curseur

    func test_restingPage_showsTheRememberedPosition() {
        let resting = AudioFullscreenPlaybackSnapshot.resting(savedPosition: 12, duration: 48)

        XCTAssertEqual(resting.progress, 0.25, accuracy: 0.0001)
        XCTAssertEqual(resting.currentTime, 12)
        XCTAssertEqual(resting.duration, 48)
        XCTAssertFalse(resting.isPlaying)
    }

    func test_restingPage_withNothingRemembered_restsAtZero() {
        XCTAssertEqual(AudioFullscreenPlaybackSnapshot.resting(savedPosition: nil, duration: 48), .idle)
        XCTAssertEqual(AudioFullscreenPlaybackSnapshot.resting(savedPosition: 12, duration: 0), .idle, "durée inconnue")
        XCTAssertEqual(AudioFullscreenPlaybackSnapshot.resting(savedPosition: 60, duration: 48), .idle, "position hors de la piste")
    }

    func test_restingPage_keepsItsLoadingState() {
        XCTAssertTrue(AudioFullscreenPlaybackSnapshot.resting(savedPosition: 12, duration: 48, isLoading: true).isLoading)
    }

    // MARK: - Le cadran : le spectre en cercle et son curseur (#10568)

    func test_dial_fraction_readsTheAngleFromTheTop_clockwise() {
        let size = CGSize(width: 200, height: 200)
        XCTAssertEqual(AudioFullscreenDialRule.fraction(at: CGPoint(x: 100, y: 0), in: size), 0, accuracy: 0.001)
        XCTAssertEqual(AudioFullscreenDialRule.fraction(at: CGPoint(x: 200, y: 100), in: size), 0.25, accuracy: 0.001)
        XCTAssertEqual(AudioFullscreenDialRule.fraction(at: CGPoint(x: 100, y: 200), in: size), 0.5, accuracy: 0.001)
        XCTAssertEqual(AudioFullscreenDialRule.fraction(at: CGPoint(x: 0, y: 100), in: size), 0.75, accuracy: 0.001)
    }

    func test_dial_scrubbed_neverJumpsOverTheTop() {
        XCTAssertEqual(AudioFullscreenDialRule.scrubbed(from: 0.95, to: 0.03), 1, "la fin ne relance pas le début")
        XCTAssertEqual(AudioFullscreenDialRule.scrubbed(from: 0.04, to: 0.97), 0, "le début ne saute pas à la fin")
        XCTAssertEqual(AudioFullscreenDialRule.scrubbed(from: 0.40, to: 0.55), 0.55)
    }

    func test_dial_resample_keepsThePeakOfEachBucket() {
        let samples: [Float] = [0.1, 0.9, 0.2, 0.3, 0.8, 0.4]
        XCTAssertEqual(AudioFullscreenDialRule.resample(samples, to: 3), [0.9, 0.3, 0.8])
        XCTAssertEqual(AudioFullscreenDialRule.resample(samples, to: 6), samples)
        XCTAssertEqual(AudioFullscreenDialRule.resample([], to: 4), [])
        XCTAssertEqual(AudioFullscreenDialRule.resample([0.5, 0.7], to: 4).count, 4, "moins d'échantillons que de barres : chaque barre en reçoit un")
    }

    func test_dial_pulse_isStillWhenPaused_andBreathesWhilePlaying() {
        XCTAssertEqual(AudioFullscreenDialRule.pulse(bar: 3, progress: 0.2, time: 12.3, isPlaying: false), 1)
        let breaths = (0..<20).map { AudioFullscreenDialRule.pulse(bar: 3, progress: 0.2, time: Double($0) * 0.07, isPlaying: true) }
        XCTAssertGreaterThan(breaths.max() ?? 0, breaths.min() ?? 0)
        XCTAssertTrue(breaths.allSatisfy { $0 > 0.5 && $0 < 1.5 })
    }

    // MARK: - Les paroles se lisent de loin (directive porteur 2026-10-13)

    func test_lyrics_areScaledFromTheFormerBody_onALargePhone_andFitASmallOne() {
        let large = (AudioFullscreenLayout.baseTranscriptSize * AudioFullscreenLayout.lyricScale).rounded()
        XCTAssertEqual(AudioFullscreenLayout.lyricScale, 2.4, accuracy: 0.001, "quatre fois, puis « diminue de 0,4 »")
        XCTAssertEqual(AudioFullscreenLayout.lyricSize(forWidth: 440), large)
        let small = AudioFullscreenLayout.lyricSize(forWidth: 320)
        XCTAssertLessThan(small, large)
        XCTAssertGreaterThan(small, AudioFullscreenLayout.baseTranscriptSize)
    }

    /// Les paroles défilent SOUS l'en-tête et le pied : le mot en cours se pose
    /// dans la bande restée libre, jamais sous le flou.
    func test_lyrics_theCurrentWordLandsInTheFreeBand_neverUnderTheFrost() {
        let anchor = AudioFullscreenLayout.lyricAnchor(header: 440, footer: 70, height: 860)
        XCTAssertGreaterThan(anchor * 860, 440)
        XCTAssertLessThan(anchor * 860, 860 - 70)
        XCTAssertEqual(AudioFullscreenLayout.lyricAnchor(header: 0, footer: 0, height: 0), 0.5)
    }

    func test_bottomRow_clearsTheHomeIndicator_evenWhenTheContainerAnnouncesNoInset() {
        XCTAssertGreaterThanOrEqual(AudioFullscreenLayout.bottomInset(safeArea: 0), 34)
        XCTAssertGreaterThan(AudioFullscreenLayout.bottomInset(safeArea: 34), 34)
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

    /// #10568 — du plus petit iPhone au plus grand, la page empilée tient dans
    /// la hauteur utile : rien sous l'encoche, rien sous la barre d'accueil.
    func test_layout_stacked_fitsTheUsableHeight_fromTheSmallestPhoneToTheLargest() {
        for size in [CGSize(width: 375, height: 647), CGSize(width: 393, height: 759), CGSize(width: 430, height: 860)] {
            let layout = AudioFullscreenLayout.resolve(for: size)
            XCTAssertEqual(layout.arrangement, .stacked)
            XCTAssertLessThanOrEqual(AudioFullscreenLayout.stackedMinimumHeight(heroDiameter: layout.heroDiameter),
                                     size.height, "\(size) : la page déborde")
        }
    }

    func test_layout_stacked_theHeroGrowsWithTheRoomLeft() {
        let small = AudioFullscreenLayout.resolve(for: CGSize(width: 375, height: 647))
        let large = AudioFullscreenLayout.resolve(for: CGSize(width: 430, height: 860))
        XCTAssertLessThan(small.heroDiameter, large.heroDiameter)
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

    // MARK: - La position suit la page regardée

    /// Vocal n°3 sur 5 ; le n°1 expire. La position gardée (2) visait l'ancien
    /// n°4, qui recevait la réaction.
    func test_index_afterAnEarlierItemLeaves_followsTheViewedPage() {
        XCTAssertEqual(AudioFullscreenPaging.index(of: "c", in: ["a", "b", "c", "d", "e"]), 2)
        XCTAssertEqual(AudioFullscreenPaging.index(of: "c", in: ["b", "c", "d", "e"]), 1)
        XCTAssertNil(AudioFullscreenPaging.index(of: "c", in: ["a", "b", "d"]))
        XCTAssertNil(AudioFullscreenPaging.index(of: nil, in: ["a"]))
    }

    func test_audioFullscreen_resolvesTheCurrentSourceByIdentity() throws {
        let source = try AppSourceGuard.unit("Meeshy/Features/Main/Views/AudioFullscreenView.swift")
        XCTAssertTrue(source.contains("AudioFullscreenPaging.index(of: currentPageID, in: ids).map { allAudioItems[$0] }"))
        XCTAssertTrue(source.contains(".adaptiveOnChange(of: ids)"))
    }
}
