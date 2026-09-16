import XCTest
@testable import Meeshy

/// **Une pièce montre ses réactions PARTOUT où elle s'ouvre** (#6789, directive
/// porteur 2026-09-16 : « lorsqu'on choisi la réaction, ce doit s'afficher sur
/// l'attachement en plein ecran et dans la conversation »).
///
/// La conversation l'affichait ; le plein écran non. Le lot n'y ajoute pas une
/// SECONDE pastille : il EXTRAIT celle qui existait, parce que deux écritures du
/// même dessin sont deux règles qui ont déjà commencé à diverger — et la
/// première divergence aurait été le renfort « j'ai réagi », que la tuile a mis
/// un lot entier à gagner.
final class AttachmentReactionBadgeTests: XCTestCase {

    // MARK: - Ce qu'il y a à dire

    /// **Pas de réaction, pas de pastille** — loi 4 : une pastille vide serait
    /// un contrôle sans effet posé sur l'image.
    func test_withoutReactions_thereIsNoBadge() {
        XCTAssertNil(AttachmentReactionBadgeModel.make(summary: nil, currentUserReactions: nil))
        XCTAssertNil(AttachmentReactionBadgeModel.make(summary: [:], currentUserReactions: ["❤️"]))
    }

    /// **Un résumé dont tous les comptes sont tombés à zéro n'est pas une
    /// pastille à zéro.** Le cas est nominal en optimiste, entre le retrait
    /// local d'un émoji et le delta serveur qui le confirme.
    func test_aSummaryWorthZero_isNotABadge() {
        XCTAssertNil(AttachmentReactionBadgeModel.make(summary: ["👍": 0], currentUserReactions: nil))
    }

    /// Le total compte TOUT, y compris ce que le plafond de trois laisse dehors.
    /// C'est lui qui empêche la pastille de mentir par troncature.
    func test_theTotalCountsEveryReaction_evenThoseNotShown() throws {
        let modèle = try XCTUnwrap(AttachmentReactionBadgeModel.make(
            summary: ["😀": 1, "😁": 2, "😂": 3, "😃": 4, "😄": 5],
            currentUserReactions: nil))

        XCTAssertEqual(modèle.emojis.count, AttachmentReactionBadgeModel.maxEmojis)
        XCTAssertEqual(modèle.total, 15, "cinq émojis distincts, quinze réactions")
    }

    /// L'ordre est STABLE : à réactions égales, la pastille ne change pas de
    /// contenu d'un rendu à l'autre. Un ordre de dictionnaire l'aurait fait
    /// clignoter.
    func test_theEmojiOrderIsStable() throws {
        let une = try XCTUnwrap(AttachmentReactionBadgeModel.make(
            summary: ["🔥": 1, "❤️": 1, "👍": 1], currentUserReactions: nil))
        let deux = try XCTUnwrap(AttachmentReactionBadgeModel.make(
            summary: ["👍": 1, "🔥": 1, "❤️": 1], currentUserReactions: nil))

        XCTAssertEqual(une.emojis, deux.emojis)
    }

    /// **« J'ai réagi à CETTE pièce »** — la donnée vit sur le modèle
    /// (`currentUserReactions`), et un site qui ne lirait que `reactionSummary`
    /// afficherait « ❤️👍 4 » sans rien qui distingue le ❤️ du lecteur.
    func test_myOwnReaction_isCalledOut() throws {
        let autrui = try XCTUnwrap(AttachmentReactionBadgeModel.make(
            summary: ["👍": 3], currentUserReactions: nil))
        let mienne = try XCTUnwrap(AttachmentReactionBadgeModel.make(
            summary: ["👍": 3, "❤️": 1], currentUserReactions: ["❤️"]))

        XCTAssertFalse(autrui.mine)
        XCTAssertTrue(mienne.mine)
    }

    /// **VoiceOver entend des RÉACTIONS, pas une suite de glyphes**, et le
    /// COMPTE n'est pas dans le libellé : il vit dans la valeur, ce qui garde
    /// les deux clés de catalogue libres de toute règle de pluriel dans sept
    /// langues (dimension 5).
    func test_voiceOverHearsReactions_andWhetherOneIsMine() throws {
        let autrui = try XCTUnwrap(AttachmentReactionBadgeModel.make(
            summary: ["👍": 2], currentUserReactions: nil))
        let mienne = try XCTUnwrap(AttachmentReactionBadgeModel.make(
            summary: ["👍": 2], currentUserReactions: ["👍"]))

        XCTAssertFalse(autrui.a11yLabel.isEmpty)
        XCTAssertFalse(autrui.a11yLabel.contains("2"), "le compte est la VALEUR, pas le libellé")
        XCTAssertNotEqual(mienne.a11yLabel, autrui.a11yLabel,
                          "une pastille où j'ai réagi ne s'annonce pas comme les autres")
    }

    // MARK: - Les deux surfaces montent LA MÊME pastille

    private func source(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(relativePath))
    }

    /// **L'inventaire des surfaces qui montrent les réactions d'une pièce.**
    ///
    /// Une garde d'inventaire, et c'est voulu : c'est la seule forme qui rougit
    /// quand une surface CESSE de monter la pastille — un défaut qu'aucun
    /// témoin de comportement ne voit, puisque la pastille reste juste là où
    /// elle est encore montée.
    ///
    /// **La TROISIÈME surface est celle qui manquait, et c'était la principale**
    /// (#6793) : le mode FOCAL est le mode de lecture par défaut d'une
    /// conversation, et son `FocalGridCell` rangeait les réactions par image
    /// « hors périmètre, accepté par arbitrage ». L'aveu était écrit dans son
    /// doc-comment depuis le début ; personne ne le relisait. Une réaction
    /// posée sur une pièce n'était donc visible NULLE PART dans le fil.
    func test_everySurfaceMountsTheSameBadge() throws {
        let surfaces = [
            // La tuile de la bulle — mode de lecture classique.
            "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift",
            // La tuile FOCAL — le mode de lecture par DÉFAUT.
            "Meeshy/Features/Main/Focal/Row/FocalAttachmentBlock.swift",
            // Le plateau du plein écran (#6789).
            "Meeshy/Features/Main/Views/ConversationMediaGalleryView+Geometry.swift",
        ]
        for chemin in surfaces {
            let code = try source(chemin)
            XCTAssertTrue(code.contains("AttachmentReactionBadge("),
                          "\(chemin) ne monte plus la pastille partagée")
            XCTAssertTrue(code.contains("AttachmentReactionBadgeModel.make("),
                          "\(chemin) doit passer par la loi, jamais lire `reactionSummary` en direct")
        }
    }

    /// **Aucune surface ne redessine la capsule.** Le dessin — fond, contour à
    /// l'accent, ombre — vit dans `AttachmentReactionBadge` et nulle part
    /// ailleurs : une seconde écriture divergerait au premier ajustement.
    func test_noSurfaceRedrawsTheCapsule() throws {
        let tuile = try source("Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift")
        XCTAssertFalse(tuile.contains("Capsule().strokeBorder(iReacted"),
                       "le dessin de la pastille a été extrait, pas dupliqué")
    }
}
