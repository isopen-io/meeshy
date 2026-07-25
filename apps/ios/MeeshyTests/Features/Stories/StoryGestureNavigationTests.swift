import XCTest
@testable import Meeshy

/// Navigation gestuelle déterministe du viewer de stories (spec 2026-07-25).
///
/// Quatre règles :
/// 1. Swipe BAS → quitte la story (animation suivant le geste, annulation au retour).
/// 2. Swipe HAUT → plein écran. Swipe BAS en plein écran → sort du plein écran
///    (il ne quitte PAS la story : la règle 2 prime sur la règle 1).
/// 3. Double tap → pause. Cantonné à une bande CENTRALE pour que le tap de
///    navigation, geste le plus fréquent, reste immédiat sur les bords.
/// 4. Swipe GAUCHE/DROITE → groupe voisin, cube suivant le geste.
///
/// Zones horizontales retenues : 30 % / 40 % / 30 %.
@MainActor
final class StoryGestureNavigationTests: XCTestCase {

    private let width: CGFloat = 400   // zones : [0,120[ · [120,280[ · [280,400]

    // MARK: - Zones de tap

    func test_zone_leftEdge_isPrevious() {
        XCTAssertEqual(StoryTapZone.zone(forX: 0, width: width), .previous)
        XCTAssertEqual(StoryTapZone.zone(forX: 119, width: width), .previous)
    }

    func test_zone_center_isCenter() {
        XCTAssertEqual(StoryTapZone.zone(forX: 120, width: width), .center)
        XCTAssertEqual(StoryTapZone.zone(forX: 200, width: width), .center)
        XCTAssertEqual(StoryTapZone.zone(forX: 279, width: width), .center)
    }

    func test_zone_rightEdge_isNext() {
        XCTAssertEqual(StoryTapZone.zone(forX: 280, width: width), .next)
        XCTAssertEqual(StoryTapZone.zone(forX: 400, width: width), .next)
    }

    /// Largeur nulle ou négative : aucune division, on retombe sur `.next`
    /// (comportement historique du bord).
    func test_zone_degenerateWidth_doesNotDivideByZero() {
        XCTAssertEqual(StoryTapZone.zone(forX: 10, width: 0), .next)
        XCTAssertEqual(StoryTapZone.zone(forX: 10, width: -5), .next)
    }

    // MARK: - Tap simple : immédiat sur les bords, inerte au centre

    private func playingContext() -> StoryGestureContext {
        StoryGestureContext(holdActive: false, isPaused: false,
                            isResumingTap: false, isComposerEngaged: false)
    }

    func test_touchUp_leftZone_navigatesPreviousImmediately() {
        let action = StoryGestureDecisions.decideTouchUp(
            context: playingContext(), touchStartX: 40, width: width,
            elapsed: 0.05, holdThreshold: 0.2)
        XCTAssertEqual(action, .navigatePrevious)
    }

    func test_touchUp_rightZone_navigatesNextImmediately() {
        let action = StoryGestureDecisions.decideTouchUp(
            context: playingContext(), touchStartX: 360, width: width,
            elapsed: 0.05, holdThreshold: 0.2)
        XCTAssertEqual(action, .navigateNext)
    }

    /// Le tap simple au centre ne navigue pas : la bande centrale est réservée
    /// au double tap. Sans cela, le premier tap d'un double tap ferait avancer
    /// la story avant que le second n'arrive.
    func test_touchUp_centerZone_doesNotNavigate() {
        let action = StoryGestureDecisions.decideTouchUp(
            context: playingContext(), touchStartX: 200, width: width,
            elapsed: 0.05, holdThreshold: 0.2)
        XCTAssertEqual(action, .none)
    }

    // MARK: - Double tap

    func test_doubleTap_inCenterZone_togglesPause() {
        let action = StoryGestureDecisions.decideDoubleTap(
            context: playingContext(), touchStartX: 200, width: width)
        XCTAssertEqual(action, .togglePause)
    }

    /// Sur les bords, le double tap n'a pas de sens : les deux taps ont déjà
    /// navigué immédiatement.
    func test_doubleTap_outsideCenterZone_isIgnored() {
        XCTAssertEqual(
            StoryGestureDecisions.decideDoubleTap(
                context: playingContext(), touchStartX: 40, width: width),
            .none)
        XCTAssertEqual(
            StoryGestureDecisions.decideDoubleTap(
                context: playingContext(), touchStartX: 360, width: width),
            .none)
    }

    func test_doubleTap_whenComposerEngaged_dismissesComposer() {
        let ctx = StoryGestureContext(holdActive: false, isPaused: false,
                                      isResumingTap: false, isComposerEngaged: true)
        XCTAssertEqual(
            StoryGestureDecisions.decideDoubleTap(context: ctx, touchStartX: 200, width: width),
            .dismissComposer)
    }

    // MARK: - Décisions verticales

    func test_vertical_swipeUp_whenWindowed_entersFullscreen() {
        let action = StoryVerticalGestureDecisions.decide(
            translationY: -90, predictedY: -150, isFullscreen: false, threshold: 60)
        XCTAssertEqual(action, .enterFullscreen)
    }

    /// Déjà en plein écran, le swipe haut n'a plus rien à activer.
    func test_vertical_swipeUp_whenFullscreen_isNone() {
        let action = StoryVerticalGestureDecisions.decide(
            translationY: -90, predictedY: -150, isFullscreen: true, threshold: 60)
        XCTAssertEqual(action, .none)
    }

    /// Règle 2 prime sur règle 1 : en plein écran, le swipe bas sort du plein
    /// écran au lieu de quitter la story.
    func test_vertical_swipeDown_whenFullscreen_exitsFullscreenNotViewer() {
        let action = StoryVerticalGestureDecisions.decide(
            translationY: 90, predictedY: 150, isFullscreen: true, threshold: 60)
        XCTAssertEqual(action, .exitFullscreen)
    }

    func test_vertical_swipeDown_whenWindowed_dismissesViewer() {
        let action = StoryVerticalGestureDecisions.decide(
            translationY: 90, predictedY: 150, isFullscreen: false, threshold: 60)
        XCTAssertEqual(action, .dismissViewer)
    }

    /// Sous le seuil et sans élan suffisant, le geste est annulé : la vue
    /// revient à sa position initiale.
    func test_vertical_belowThreshold_cancels() {
        XCTAssertEqual(
            StoryVerticalGestureDecisions.decide(
                translationY: 20, predictedY: 30, isFullscreen: false, threshold: 60),
            .cancel)
        XCTAssertEqual(
            StoryVerticalGestureDecisions.decide(
                translationY: -20, predictedY: -30, isFullscreen: false, threshold: 60),
            .cancel)
    }

    /// Un flick court mais rapide valide via la translation prédite.
    func test_vertical_shortButFastFlick_validatesViaPrediction() {
        XCTAssertEqual(
            StoryVerticalGestureDecisions.decide(
                translationY: 30, predictedY: 400, isFullscreen: false, threshold: 60),
            .dismissViewer)
        XCTAssertEqual(
            StoryVerticalGestureDecisions.decide(
                translationY: -30, predictedY: -400, isFullscreen: false, threshold: 60),
            .enterFullscreen)
    }
}

// MARK: - Spec gestuelle révisée (2026-07-25)

/// Reprise de lecture et double tap se disputent la bande centrale : si un
/// simple toucher au centre relance la story, le PREMIER tap d'un double tap
/// relance avant que le second n'arrive — « double tap relance » devient alors
/// impossible. Les bords, eux, doivent rester immédiats.
@MainActor
final class StoryPausedTouchDownTests: XCTestCase {

    private let width: CGFloat = 400   // zones : [0,120[ · [120,280[ · [280,400]

    private func pausedContext() -> StoryGestureContext {
        StoryGestureContext(holdActive: false, isPaused: true,
                            isResumingTap: false, isComposerEngaged: false)
    }

    func test_touchDown_whenPaused_onLeftEdge_resumes() {
        XCTAssertEqual(
            StoryGestureDecisions.decideTouchDown(
                context: pausedContext(), touchStartX: 40, width: width),
            .resumeFromPause)
    }

    func test_touchDown_whenPaused_onRightEdge_resumes() {
        XCTAssertEqual(
            StoryGestureDecisions.decideTouchDown(
                context: pausedContext(), touchStartX: 360, width: width),
            .resumeFromPause)
    }

    /// Le cœur de la règle : au centre, le touch-down ne reprend PAS.
    func test_touchDown_whenPaused_inCenterBand_doesNotResume() {
        XCTAssertEqual(
            StoryGestureDecisions.decideTouchDown(
                context: pausedContext(), touchStartX: 200, width: width),
            .none)
    }

    func test_touchDown_whilePlaying_neverResumes() {
        let playing = StoryGestureContext(holdActive: false, isPaused: false,
                                          isResumingTap: false, isComposerEngaged: false)
        XCTAssertEqual(
            StoryGestureDecisions.decideTouchDown(
                context: playing, touchStartX: 40, width: width),
            .none)
    }

    func test_touchDown_whenComposerEngaged_neverResumes() {
        let composing = StoryGestureContext(holdActive: false, isPaused: true,
                                            isResumingTap: false, isComposerEngaged: true)
        XCTAssertEqual(
            StoryGestureDecisions.decideTouchDown(
                context: composing, touchStartX: 40, width: width),
            .none)
    }
}

/// Le long-press est un TOGGLE : il met en pause et masque les contrôleurs, un
/// second long-press rend la lecture ET les contrôleurs. Sans cette garde, il
/// redeviendrait un « hold to pause » à sens unique.
@MainActor
final class StoryLongPressToggleGuardTests: XCTestCase {

    func test_longPressArming_togglesInsteadOfAlwaysPausing() throws {
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()   // Stories
                .deletingLastPathComponent()   // Features
                .deletingLastPathComponent()   // MeeshyTests
                .deletingLastPathComponent()   // ios
                .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift"),
            encoding: .utf8
        )

        XCTAssertTrue(source.contains("if isLongPressPaused {"),
                      "le long-press doit tester l'état de pause pour basculer")
        XCTAssertTrue(source.contains("holdActive = false\n                                        isLongPressPaused = false"),
                      "un second long-press doit rendre la lecture")
    }
}
