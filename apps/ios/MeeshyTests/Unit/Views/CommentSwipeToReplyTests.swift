import XCTest
import CoreGraphics
import MeeshySDK
@testable import Meeshy

/// **Glisser un commentaire vers la droite y répond, partout** (#8582).
///
/// Directive porteur 2026-09-28 : « lorsqu'on swipe vers la droite sur un
/// commentaire ça ouvre le composeur de message pour y répondre » — dans le
/// fil, la page détail, les réels, les stories. Le geste reprend la PISTE de la
/// bulle de message (même zone, même élastique, même seuil) : une seule source,
/// `BubbleSwipeResistance`, et ces témoins la font varier des deux côtés.
@MainActor
final class CommentSwipeToReplyTests: XCTestCase {

    // MARK: - La piste partagée avec la bulle

    func test_trackedOffset_insideTheActionZone_followsTheFingerExactly() {
        XCTAssertEqual(BubbleSwipeResistance.trackedOffset(translation: 40), 40)
        XCTAssertEqual(BubbleSwipeResistance.trackedOffset(translation: -40), -40)
        XCTAssertEqual(BubbleSwipeResistance.trackedOffset(translation: 72), 72)
    }

    func test_trackedOffset_pastTheActionZone_resistsWithTheRubberBand() {
        XCTAssertEqual(BubbleSwipeResistance.trackedOffset(translation: 172), 72 + 100 * 0.15, accuracy: 0.0001)
        XCTAssertEqual(BubbleSwipeResistance.trackedOffset(translation: -172), -(72 + 100 * 0.15), accuracy: 0.0001)
    }

    func test_commits_atTheCommitDistance_andNotOnePointBefore() {
        XCTAssertTrue(BubbleSwipeResistance.commits(offset: 66))
        XCTAssertTrue(BubbleSwipeResistance.commits(offset: 80))
        XCTAssertFalse(BubbleSwipeResistance.commits(offset: 65.9))
        XCTAssertFalse(BubbleSwipeResistance.commits(offset: -80),
                       "Un décalage orienté À REBOURS de l'action ne la déclenche jamais.")
    }

    func test_theCommitDistance_sitsInsideTheActionZone() {
        XCTAssertLessThan(BubbleSwipeResistance.commitDistance, BubbleSwipeResistance.actionZone,
                          "Le seuil doit être atteignable sans forcer l'élastique.")
    }

    // MARK: - Le glissé du commentaire : vers la DROITE seulement

    func test_offset_rightwardHorizontalDrag_followsTheSharedTrack() {
        XCTAssertEqual(CommentSwipeRules.offset(forTranslation: CGSize(width: 50, height: 4)), 50)
        XCTAssertEqual(CommentSwipeRules.offset(forTranslation: CGSize(width: 172, height: 4)),
                       BubbleSwipeResistance.trackedOffset(translation: 172))
    }

    func test_offset_leftwardDrag_isClampedToRest() {
        XCTAssertEqual(CommentSwipeRules.offset(forTranslation: CGSize(width: -120, height: 0)), 0,
                       "Glisser à GAUCHE ne déplace jamais la ligne : seule la réponse existe sur un commentaire.")
    }

    func test_offset_verticalOrShortDrag_doesNotEngage() {
        XCTAssertNil(CommentSwipeRules.offset(forTranslation: CGSize(width: 30, height: 20)),
                     "Un glissé qui n'est pas franchement horizontal appartient au défilement.")
        XCTAssertNil(CommentSwipeRules.offset(forTranslation: CGSize(width: 15, height: 0)),
                     "Sous la distance minimale, rien ne bouge — un tap reste un tap.")
    }

    func test_release_underTheCommitDistance_cancels_andPastIt_replies() {
        XCTAssertFalse(CommentSwipeRules.repliesOnRelease(offset: 50), "Relâcher avant le seuil annule.")
        XCTAssertTrue(CommentSwipeRules.repliesOnRelease(offset: 66))
        XCTAssertFalse(CommentSwipeRules.repliesOnRelease(offset: 0))
    }

    func test_progress_growsWithTheOffset_andSaturatesAtTheCommitDistance() {
        XCTAssertEqual(CommentSwipeRules.progress(offset: 0), 0)
        XCTAssertEqual(CommentSwipeRules.progress(offset: 33), 0.5, accuracy: 0.0001)
        XCTAssertEqual(CommentSwipeRules.progress(offset: 66), 1)
        XCTAssertEqual(CommentSwipeRules.progress(offset: 90), 1)
        XCTAssertEqual(CommentSwipeRules.progress(offset: -10), 0)
    }

    // MARK: - Le voile d'un commentaire flouté

    func test_aBlurredComment_isVeiledUntilRevealed() {
        let blurred = MessageEffects(flags: [.blurred, .glow])
        XCTAssertTrue(CommentVeilRules.isVeiled(effects: blurred, isRevealed: false))
        XCTAssertFalse(CommentVeilRules.isVeiled(effects: blurred, isRevealed: true))
    }

    func test_aCommentWithoutBlur_isNeverVeiled() {
        XCTAssertFalse(CommentVeilRules.isVeiled(effects: MessageEffects(flags: [.pulse, .sparkle]), isRevealed: false))
        XCTAssertFalse(CommentVeilRules.isVeiled(effects: .none, isRevealed: false))
    }
}

/// Les quatre surfaces où un commentaire se lit montent le MÊME geste et le
/// MÊME corps d'effets — une surface qui les oublie redevient une jumelle
/// divergente, et aucun autre témoin ne le verrait.
@MainActor
final class CommentSwipeToReplyWiringGuardTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/" + path)
    }

    private static let commentRows = [
        "CommentRowView.swift",
        "StoryCommentRowView.swift",
        "FeedPostCard+CommentsPreview.swift",
    ]

    func test_everyCommentRow_mountsTheSwipeAndTheEffectBody() throws {
        for row in Self.commentRows {
            let text = try source(row)
            XCTAssertTrue(text.contains(".commentSwipeToReply("),
                          "\(row) : glisser à droite doit y répondre (directive 2026-09-28).")
            XCTAssertTrue(text.contains(".commentBody(effects: comment.effects"),
                          "\(row) : les effets autorisés (flou, lueur, pulsation…) doivent s'y appliquer.")
            XCTAssertFalse(text.contains(".messageEffects("),
                           "\(row) : les effets passent par `.commentBody`, jamais par un montage local qui oublierait le flou.")
        }
    }

    func test_theFeedPreview_opensTheSheetWithTheReplyAlreadyTargeted() throws {
        let preview = try source("FeedPostCard+CommentsPreview.swift")
        XCTAssertTrue(preview.contains("openComments(replyingTo: comment)"),
                      "Glisser un commentaire de l'aperçu doit ouvrir la feuille EN RÉPONSE à lui.")

        let card = try source("FeedPostCard.swift")
        XCTAssertTrue(card.contains("initialReplyTarget: commentsReplyTarget"),
                      "La carte doit remettre la cible à la feuille qu'elle présente.")

        let sheet = try source("FeedCommentsSheet.swift")
        XCTAssertTrue(sheet.contains("initialReplyTarget: FeedComment?"))
        XCTAssertTrue(sheet.contains("beginReply(to: initialReplyTarget)"),
                      "La feuille consomme la cible par le chemin UNIQUE de la réponse (bannière + focus + @mention).")
    }

    func test_theStoryRow_repaintsWhenItsEffectsChange() throws {
        let row = try source("StoryCommentRowView.swift")
        XCTAssertTrue(row.contains("lhs.comment.effectFlags == rhs.comment.effectFlags"),
                      "Sans cette ligne, un commentaire édité (effets changés) ne se repeint jamais.")
    }

    func test_theBubble_readsTheSharedTrack_insteadOfItsOwnConstants() throws {
        let bubble = try source("MessageListView.swift")
        XCTAssertTrue(bubble.contains("BubbleSwipeResistance.trackedOffset(translation:"))
        XCTAssertTrue(bubble.contains("BubbleSwipeResistance.commits(offset:"))
        XCTAssertFalse(bubble.contains("let zone: CGFloat = 72"),
                       "La zone d'action vit dans `BubbleSwipeResistance`, jamais redite dans la bulle.")
    }
}
