import XCTest
import SwiftUI
@testable import Meeshy

/// Tests-de-spec pour `triggerStoryReaction` et le vol de réaction qui a
/// remplacé la « big reaction » 100pt (spec scrub 2026-08-11 —
/// `StoryReactionFlight` / `StoryReactionFlightView`).
///
/// `triggerStoryReaction` est private sur `StoryViewerView` et dépend de
/// `@State` SwiftUI difficiles à instrumenter sans refactor. Les cas qui
/// touchent cette logique (préambule dismiss, origine du vol) documentent le
/// comportement attendu (mirror de la spec) et servent de sentinelle
/// d'intention — la vraie garantie de régression vient (1) de l'inspection
/// du code source (le bloc `if showFullEmojiPicker { ... }` doit être
/// présent en tête de `triggerStoryReaction`, le vol doit démarrer de
/// `originFrame ?? heartFrame`) et (2) du smoke test manuel (cf.
/// `docs/superpowers/specs/2026-05-28-story-reactions-canvas-uxfixes-design.md` § Section 1A).
///
/// `StoryReactionFlight` / `StoryReactionFlightView`, eux, sont des types
/// non-private et testables directement — les premiers cas ci-dessous les
/// exercent réellement plutôt que de les mirrorer en variables locales.
@MainActor
final class StoryViewerReactionFlowTests: XCTestCase {

    // MARK: - StoryReactionFlight / StoryReactionFlightView (types réels)

    func test_reactionFlight_capturesEmojiAndOriginFrame() {
        let origin = CGRect(x: 12, y: 34, width: 40, height: 40)
        let flight = StoryReactionFlight(emoji: "🔥", from: origin)

        XCTAssertEqual(flight.emoji, "🔥")
        XCTAssertEqual(flight.from, origin)
    }

    func test_reactionFlight_twoInstances_haveDistinctIdentity() {
        // Important pour Layer 9 (+Canvas.swift, `.id(flight.id)`) : deux
        // vols consécutifs — même emoji, même cadre — doivent être des vues
        // SwiftUI DISTINCTES. Sans identité par-vol, une deuxième réaction
        // envoyée dans les 750ms de la première ne fait que muter la vue déjà
        // montée (identité structurelle) : `@State progress` reste à 1,
        // `onAppear` ne re-tique jamais (aucun mouvement, aucun rebond), et
        // l'`asyncAfter` du premier vol efface l'overlay en avance.
        let origin = CGRect(x: 0, y: 0, width: 10, height: 10)
        let first = StoryReactionFlight(emoji: "❤️", from: origin)
        let second = StoryReactionFlight(emoji: "❤️", from: origin)

        XCTAssertNotEqual(first.id, second.id)
        XCTAssertNotEqual(first, second, "Deux vols distincts ne doivent jamais être Equatable-égaux")
    }

    func test_reactionFlightView_onArrivedAndOnFinished_fireIndependently() {
        // `heartBouncePulse` (rebond du cœur) ne tique PLUS dans
        // `triggerStoryReaction` — il tique à l'ARRIVÉE du vol, via cette
        // closure (+Canvas.swift Layer 9 : `onArrived: { heartBouncePulse += 1 }`).
        var arrivedCount = 0
        var finishedCount = 0
        let view = StoryReactionFlightView(
            flight: StoryReactionFlight(emoji: "😮", from: .zero),
            target: CGRect(x: 100, y: 200, width: 20, height: 20),
            onArrived: { arrivedCount += 1 },
            onFinished: { finishedCount += 1 }
        )

        view.onArrived()
        XCTAssertEqual(arrivedCount, 1, "onArrived pilote le rebond du cœur (heartBouncePulse) à l'impact")
        XCTAssertEqual(finishedCount, 0, "onFinished ne doit pas se déclencher avant la fin réelle du vol")

        view.onFinished()
        XCTAssertEqual(finishedCount, 1, "onFinished efface l'overlay (reactionFlight = nil)")
    }

    // MARK: - triggerStoryReaction preamble (spec-pattern — état private)

    func test_specPattern_fullPickerVisible_dismissesItImmediately() {
        // Mirror du préambule de triggerStoryReaction.
        var showFullEmojiPicker = true

        if showFullEmojiPicker {
            showFullEmojiPicker = false  // dismiss IMMÉDIAT
        }

        XCTAssertFalse(showFullEmojiPicker, "Full picker doit se fermer immédiatement")
    }

    func test_specPattern_stripDismissal_isSynchronousNotDelayed() {
        // Spec scrub 2026-08-11 : l'ancien écho différé de 0.5s (`asyncAfter`)
        // a été supprimé — la barre se referme SYNCHRONEMENT dans le
        // préambule (seule l'animation visuelle `.easeOut` dure 0.12s), pour
        // laisser la scène au vol de réaction.
        var showEmojiStrip = true

        // Mirror : withAnimation(.easeOut(duration: 0.12)) { showEmojiStrip = false }
        showEmojiStrip = false

        XCTAssertFalse(showEmojiStrip, "La barre se ferme dans le même appel, pas après un délai de 0.5s")
    }

    func test_specPattern_reactionFlight_originFallsBackToHeartFrameWhenNil() {
        // Mirror de `let origin = originFrame ?? heartFrame` : un tap direct
        // sur le cœur (originFrame nil) fait dégénérer le vol en pop sur
        // place — même chemin de code qu'un vol depuis une tuile.
        let heartFrame = CGRect(x: 340, y: 760, width: 44, height: 44)
        let originFrame: CGRect? = nil

        let origin = originFrame ?? heartFrame
        let flight = StoryReactionFlight(emoji: "❤️", from: origin)

        XCTAssertEqual(flight.from, heartFrame)
    }

    func test_specPattern_reactionFlight_originUsesTileFrameWhenProvided() {
        let heartFrame = CGRect(x: 340, y: 760, width: 44, height: 44)
        let tileFrame = CGRect(x: 40, y: 700, width: 32, height: 32)
        let originFrame: CGRect? = tileFrame

        let origin = originFrame ?? heartFrame
        let flight = StoryReactionFlight(emoji: "🔥", from: origin)

        XCTAssertEqual(flight.from, tileFrame)
    }

    func test_specPattern_noOverlayVisible_flightStillFires() {
        // Pas d'overlay visible → le vol démarre quand même (dégénère en pop
        // sur place depuis le cœur si aucune tuile n'a été survolée).
        let showFullEmojiPicker = false
        let showEmojiStrip = false
        let heartFrame = CGRect(x: 340, y: 760, width: 44, height: 44)

        let flight = StoryReactionFlight(emoji: "🔥", from: heartFrame)

        XCTAssertFalse(showFullEmojiPicker)
        XCTAssertFalse(showEmojiStrip)
        XCTAssertEqual(flight.emoji, "🔥")
    }

    // MARK: - Rollback pattern (P1 — 409 REACTION_LIMIT_REACHED)
    //
    // These two tests mirror the snapshot → optimistic-mutate → rollback-on-
    // failure sequence as spec-pattern documentation of intent (the animation
    // preamble above them genuinely IS private-state-bound). The REAL
    // rollback guarantee — including the `sendReaction` swipe-away guard
    // these local-variable copies can't see — now has its own regression
    // coverage against the actual production method: `sendReaction` gained
    // an injectable `interactionService` parameter (defaults to the real
    // `StoryInteractionService()`), and `StoryViewerReactionRollbackTests`
    // exercises it end-to-end via a `MockAPIClientForApp`.

    func test_specPattern_reactionRejected_restoresExactPriorSnapshot() {
        // Arrange: user already reacted with 👍 before this tap.
        var storyCurrentUserReactions = ["👍"]
        var storyReactionCount = 3

        // Snapshot taken BEFORE the optimistic mutation (mirrors triggerStoryReaction).
        let priorReactions = storyCurrentUserReactions
        let priorCount = storyReactionCount

        // Optimistic mutation: user taps a NEW emoji, server will reject it
        // (409 REACTION_LIMIT_REACHED — max 1 reaction per user already spent).
        let emoji = "😂"
        if !storyCurrentUserReactions.contains(emoji) {
            storyCurrentUserReactions.append(emoji)
            storyReactionCount += 1
        }
        XCTAssertEqual(storyCurrentUserReactions, ["👍", "😂"], "Precondition: optimistic append happened")
        XCTAssertEqual(storyReactionCount, 4, "Precondition: optimistic bump happened")

        // Act: the network call throws (mirrors the `catch` in `sendReaction`).
        let networkCallDidThrow = true
        if networkCallDidThrow {
            storyCurrentUserReactions = priorReactions
            storyReactionCount = priorCount
        }

        // Assert: rolled back to the EXACT prior state — not emptied, not
        // decremented blindly (the prior 👍 reaction is preserved).
        XCTAssertEqual(storyCurrentUserReactions, ["👍"])
        XCTAssertEqual(storyReactionCount, 3)
    }

    func test_specPattern_reactionSucceeds_keepsOptimisticMutation() {
        var storyCurrentUserReactions: [String] = []
        var storyReactionCount = 0

        let priorReactions = storyCurrentUserReactions
        let priorCount = storyReactionCount

        let emoji = "🔥"
        if !storyCurrentUserReactions.contains(emoji) {
            storyCurrentUserReactions.append(emoji)
            storyReactionCount += 1
        }

        let networkCallDidThrow = false
        if networkCallDidThrow {
            storyCurrentUserReactions = priorReactions
            storyReactionCount = priorCount
        }

        XCTAssertEqual(storyCurrentUserReactions, ["🔥"], "Successful reaction keeps the optimistic emoji")
        XCTAssertEqual(storyReactionCount, 1)
    }
}
