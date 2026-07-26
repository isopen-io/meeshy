import XCTest
@testable import Meeshy

/// Pinning tests for `StoryGestureDecisions` — the pure decision helpers
/// behind the story viewer's tap/long-press overlay. The semantic these
/// tests pin down :
///
/// - `isPaused` is the **single source of truth** for the long-press toggle.
/// - Long-press ≥ 200 ms ⇒ `isPaused` becomes `true` (timer + bg video +
///   audio + effects freeze together). Release of the hold does **not**
///   resume — the story stays paused.
/// - Next short tap on a paused story ⇒ resumes (`isPaused = false`) and
///   does **not** navigate.
/// - Short tap on a playing story ⇒ navigate prev/next based on side.
/// - Composer engaged ⇒ tap dismisses the composer instead.
@MainActor
final class StoryGestureDecisionsTests: XCTestCase {

    // MARK: - decideTouchDown

    func test_touchDown_whenPlaying_returnsNone() {
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: false,
            isResumingTap: false,
            isComposerEngaged: false
        )
        XCTAssertEqual(StoryGestureDecisions.decideTouchDown(context: ctx, touchStartX: 10, width: 400), .none)
    }

    func test_touchDown_whenPaused_returnsResumeFromPause() {
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: true,
            isResumingTap: false,
            isComposerEngaged: false
        )
        XCTAssertEqual(StoryGestureDecisions.decideTouchDown(context: ctx, touchStartX: 10, width: 400), .resumeFromPause)
    }

    func test_touchDown_whenPausedButComposerEngaged_returnsNone() {
        // Composer focus suppresses the resume tap — the composer dismiss
        // gesture is handled by the touch-up branch.
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: true,
            isResumingTap: false,
            isComposerEngaged: true
        )
        XCTAssertEqual(StoryGestureDecisions.decideTouchDown(context: ctx, touchStartX: 10, width: 400), .none)
    }

    // MARK: - decideTouchUp — composer engaged

    func test_touchUp_whenComposerEngaged_dismissesComposer() {
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: false,
            isResumingTap: false,
            isComposerEngaged: true
        )
        let action = StoryGestureDecisions.decideTouchUp(
            context: ctx,
            touchStartX: 50,
            width: 400,
            elapsed: 0.05,
            holdThreshold: 0.2
        )
        XCTAssertEqual(action, .dismissComposer)
    }

    // MARK: - decideTouchUp — resuming tap

    func test_touchUp_whenResumingTap_returnsNone_noNavigation() {
        // A short tap that came in on a paused story already flipped
        // `isPaused = false` at touch-down — the release must be a no-op.
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: false,
            isResumingTap: true,
            isComposerEngaged: false
        )
        let action = StoryGestureDecisions.decideTouchUp(
            context: ctx,
            touchStartX: 350,   // right half — would normally navigate next
            width: 400,
            elapsed: 0.06,
            holdThreshold: 0.2
        )
        XCTAssertEqual(action, .none, "Resuming tap must NEVER trigger navigation")
    }

    // MARK: - decideTouchUp — long-press confirmed

    func test_touchUp_whenHoldActive_confirmsLongPressPause() {
        // Hold task fired ≥200 ms ago → `holdActive = true`, `isPaused` was
        // flipped to true. Release just confirms the latch.
        let ctx = StoryGestureContext(
            holdActive: true,
            isPaused: true,
            isResumingTap: false,
            isComposerEngaged: false
        )
        let action = StoryGestureDecisions.decideTouchUp(
            context: ctx,
            touchStartX: 50,
            width: 400,
            elapsed: 0.25,
            holdThreshold: 0.2
        )
        XCTAssertEqual(action, .confirmLongPressPause)
    }

    // MARK: - decideTouchUp — race window

    func test_touchUp_elapsedExceedsThreshold_butHoldInactive_returnsNone() {
        // Edge case : the user held just past the threshold but the hold
        // task hasn't ticked yet. We refuse to navigate (would feel like a
        // hover-cancel jumping forward) and refuse to latch (we never
        // committed the pause). Just a no-op.
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: false,
            isResumingTap: false,
            isComposerEngaged: false
        )
        let action = StoryGestureDecisions.decideTouchUp(
            context: ctx,
            touchStartX: 50,
            width: 400,
            elapsed: 0.21,
            holdThreshold: 0.2
        )
        XCTAssertEqual(action, .none)
    }

    // MARK: - decideTouchUp — short tap navigation

    func test_touchUp_shortTapLeftEdge_navigatesPrevious() {
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: false,
            isResumingTap: false,
            isComposerEngaged: false
        )
        let action = StoryGestureDecisions.decideTouchUp(
            context: ctx,
            touchStartX: 50,
            width: 400,
            elapsed: 0.05,
            holdThreshold: 0.2
        )
        XCTAssertEqual(action, .navigatePrevious)
    }

    func test_touchUp_shortTapRightEdge_navigatesNext() {
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: false,
            isResumingTap: false,
            isComposerEngaged: false
        )
        let action = StoryGestureDecisions.decideTouchUp(
            context: ctx,
            touchStartX: 300,
            width: 400,
            elapsed: 0.05,
            holdThreshold: 0.2
        )
        XCTAssertEqual(action, .navigateNext)
    }

    /// Le milieu exact appartenait au côté `next` quand l'écran était coupé en
    /// deux. Depuis l'introduction des bandes 30/40/30 (spec 2026-07-25), le
    /// centre est réservé au double tap et ne navigue plus.
    /// Voir `StoryGestureNavigationTests` pour la couverture des trois bandes.
    func test_touchUp_shortTapAtExactCenter_doesNotNavigate() {
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: false,
            isResumingTap: false,
            isComposerEngaged: false
        )
        let action = StoryGestureDecisions.decideTouchUp(
            context: ctx,
            touchStartX: 200,
            width: 400,
            elapsed: 0.05,
            holdThreshold: 0.2
        )
        XCTAssertEqual(action, .none)
    }

    // MARK: - decideTouchUp — le doigt a bougé (slop franchi)

    /// Depuis le 2026-07-26, le drag du lecteur est reconnu EN PARALLÈLE de cet
    /// overlay (`.simultaneousGesture` sur l'ancêtre, pour que les swipes
    /// cessent d'être morts). Un swipe parti d'une bande latérale relâche donc
    /// aussi ce recognizer-ci : sans la porte `didExceedSlop`, l'utilisateur
    /// naviguait d'une story ET changeait de groupe du même geste.
    ///
    /// Le défaut du champ est `false` (« toucher immobile ») : c'est le cas
    /// historique, et c'est pourquoi les contextes des autres tests restent
    /// valides tels quels.
    func test_touchUp_afterExceedingSlop_doesNotNavigate() {
        for touchStartX: CGFloat in [50, 300] {   // bande gauche, puis bande droite
            let ctx = StoryGestureContext(
                holdActive: false,
                isPaused: false,
                isResumingTap: false,
                isComposerEngaged: false,
                didExceedSlop: true
            )
            let action = StoryGestureDecisions.decideTouchUp(
                context: ctx,
                touchStartX: touchStartX,
                width: 400,
                elapsed: 0.05,
                holdThreshold: 0.2
            )
            XCTAssertEqual(action, .none,
                           "Un toucher qui a dépassé le slop appartient au drag parent, " +
                           "il ne doit plus naviguer (x = \(touchStartX)).")
        }
    }

    /// La porte est placée APRÈS `holdActive` : un long-press confirmé puis
    /// relâché garde son contrat même si le doigt a dérivé de quelques points
    /// pendant les 200 ms de maintien — sinon la pause « sauterait » sur le
    /// moindre tremblement.
    func test_touchUp_holdConfirmedThenSlop_stillConfirmsThePause() {
        let ctx = StoryGestureContext(
            holdActive: true,
            isPaused: true,
            isResumingTap: false,
            isComposerEngaged: false,
            didExceedSlop: true
        )
        let action = StoryGestureDecisions.decideTouchUp(
            context: ctx,
            touchStartX: 50,
            width: 400,
            elapsed: 0.25,
            holdThreshold: 0.2
        )
        XCTAssertEqual(action, .confirmLongPressPause)
    }

    /// `decideDoubleTap` ne tranche QUE la bande : au centre, un double tap vaut
    /// toujours `.togglePause`. C'est l'appelant (`StoryGestureOverlayView`) qui
    /// décide quels relâchements ALIMENTENT la fenêtre de double tap — verrouillé
    /// par le test de source juste en dessous.
    func test_doubleTap_inCenterBand_togglesPause() {
        let ctx = StoryGestureContext(
            holdActive: false,
            isPaused: false,
            isResumingTap: false,
            isComposerEngaged: false
        )
        XCTAssertEqual(
            StoryGestureDecisions.decideDoubleTap(context: ctx, touchStartX: 200, width: 400),
            .togglePause
        )
    }

    /// UN TOUCHER QUI A BOUGÉ N'ALIMENTE PAS LA FENÊTRE DE DOUBLE TAP.
    ///
    /// Corrigé le 2026-07-26. `isCleanTap` excluait volontairement
    /// `didExceedSlop`, au motif que « le second tap d'un double tap arrive
    /// presque toujours à quelques points du premier » — justification fausse :
    /// ce drapeau mesure le déplacement À L'INTÉRIEUR du toucher courant, jamais
    /// la distance entre deux taps successifs (seul l'écart de TEMPS l'est). Un
    /// vrai second tap est immobile ; en revanche deux flicks horizontaux
    /// enchaînés dans la bande centrale (geste courant pour défiler les groupes)
    /// remplissaient la fenêtre et déclenchaient `onTogglePause()` : changement de
    /// groupe ET pause + chrome masqué, sans un seul tap.
    ///
    /// `isCleanTap` vit dans la View (`@State` + `GeometryProxy`), non
    /// instanciable en test : garde par analyse de source, pattern établi du dépôt.
    func test_movedTouch_doesNotFeedTheDoubleTapWindow() throws {
        let canvasURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift")
        let source = try String(contentsOf: canvasURL, encoding: .utf8)

        guard let start = source.range(of: "let isCleanTap ="),
              let end = source.range(of: "if isCleanTap,", range: start.upperBound..<source.endIndex) else {
            return XCTFail("expression `isCleanTap` introuvable dans StoryViewerView+Canvas.swift")
        }
        let expression = String(source[start.upperBound..<end.lowerBound])
        XCTAssertTrue(
            expression.contains("!ctx.didExceedSlop"),
            "isCleanTap doit exclure les touchers qui ont franchi le slop — sinon deux " +
            "flicks au centre mettent la story en pause en plus de changer de groupe."
        )
    }

    // MARK: - End-to-end flow

    /// Scénario complet : story en lecture → long-press → pause confirmée
    /// au release → tap suivant → reprise sans navigation.
    func test_endToEnd_longPressThenTap_pauseAndResume() {
        // 1. Touch-down sur story en lecture : pas de resume, hold s'arme.
        var ctx = StoryGestureContext(
            holdActive: false,
            isPaused: false,
            isResumingTap: false,
            isComposerEngaged: false
        )
        XCTAssertEqual(StoryGestureDecisions.decideTouchDown(context: ctx, touchStartX: 10, width: 400), .none)

        // 2. Après 200 ms, le hold se confirme dans la View (poserait
        // holdActive = true et isPaused = true).
        ctx.holdActive = true
        ctx.isPaused = true

        // 3. Release : on confirme la pause, pas de nav.
        XCTAssertEqual(
            StoryGestureDecisions.decideTouchUp(
                context: ctx,
                touchStartX: 50,
                width: 400,
                elapsed: 0.25,
                holdThreshold: 0.2
            ),
            .confirmLongPressPause
        )

        // 4. Nouveau touch-down (story toujours paused) : reprend la lecture.
        ctx = StoryGestureContext(
            holdActive: false,
            isPaused: true,
            isResumingTap: false,
            isComposerEngaged: false
        )
        XCTAssertEqual(StoryGestureDecisions.decideTouchDown(context: ctx, touchStartX: 10, width: 400), .resumeFromPause)

        // 5. La View pose isResumingTap = true et isPaused = false pour le
        // reste du geste. Release : no-op, surtout pas de nav.
        ctx.isPaused = false
        ctx.isResumingTap = true
        XCTAssertEqual(
            StoryGestureDecisions.decideTouchUp(
                context: ctx,
                touchStartX: 350,
                width: 400,
                elapsed: 0.08,
                holdThreshold: 0.2
            ),
            .none
        )
    }
}
