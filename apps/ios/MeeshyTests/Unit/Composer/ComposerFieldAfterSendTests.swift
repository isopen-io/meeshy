import XCTest
@testable import Meeshy

/// **Après un envoi, le champ vaut ce que dit CELUI QUI A ENVOYÉ** (directive
/// porteur 2026-09-06, #5326 ; défaut #9311).
///
/// Ces témoins gardent la direction de l'erreur. Vider le champ sans condition
/// aurait effacé un texte que l'hôte vient de REFUSER d'envoyer (upload en
/// cours, contenu jugé vide) : l'auteur perdrait sa saisie sans rien avoir
/// envoyé. Lire la source de l'hôte sans savoir s'il a pris l'envoi en charge
/// ressuscite le texte chez les hôtes qui ne la vident jamais (#9311).
final class ComposerFieldAfterSendTests: XCTestCase {

    // MARK: - L'hôte a pris l'envoi en charge (`onCustomSend:`, la conversation)

    /// L'hôte a pris le texte et vidé sa source : le champ suit.
    func test_lHoteAVide_leChampSeVide() {
        XCTAssertEqual(ComposerFieldAfterSend.resolve(local: "Bonjour", host: "", sender: .host), "")
    }

    /// **La protection de #5326.** L'hôte a refusé l'envoi
    /// (`sendMessageWithAttachments` sur `isUploading` ou un contenu jugé vide,
    /// `submitEdit`) — il n'a pas touché à sa source, qui porte encore le texte
    /// poussé juste avant. Le champ le garde.
    func test_lHoteARefuse_leChampGardeLeTexte() {
        XCTAssertEqual(ComposerFieldAfterSend.resolve(local: "Bonjour", host: "Bonjour", sender: .host), "Bonjour")
    }

    /// L'hôte a substitué autre chose (brouillon restauré, texte corrigé) : sa
    /// valeur gagne, parce qu'il EST la source du champ dès qu'il tient l'envoi.
    func test_lHoteASubstitue_saValeurGagne() {
        XCTAssertEqual(ComposerFieldAfterSend.resolve(local: "Bonjour", host: "Bonsoir", sender: .host), "Bonsoir")
    }

    // MARK: - La barre a envoyé elle-même (`onSendMessage:` / `onSend:`)

    /// **LE témoin de #9311.** Commentaires de post (`PostDetailView+CommentComposer`),
    /// feuille de commentaires (`FeedCommentsSheet`), canvas de story
    /// (`StoryViewerView+CanvasComposerBar`), barre de réponse média
    /// (`MediaReplyComposerBar`) : ils passent `textBinding:` avec
    /// `onSendMessage:` et ne vident jamais leur source. Après un envoi RÉUSSI
    /// par la touche Retour, `handleSend` a vidé le champ local ; la source de
    /// l'hôte porte encore le texte envoyé. Elle ne dit rien d'un refus : le
    /// champ reste vide.
    func test_laBarreAEnvoye_laSourceImmobileDeLHote_neRessusciteRien() {
        XCTAssertEqual(ComposerFieldAfterSend.resolve(local: "", host: "Bonjour", sender: .composer), "")
    }

    /// La barre a refusé elle-même (texte vide, aucune pièce jointe) : son
    /// `guard` n'a rien touché, le champ garde ce qu'il portait.
    func test_laBarreARefuse_leChampLocalFaitFoi() {
        XCTAssertEqual(ComposerFieldAfterSend.resolve(local: " ", host: " ", sender: .composer), " ")
    }

    /// Sans hôte, le composer est seul maître : `handleSend` a déjà vidé son
    /// propre état, et la règle ne le contredit pas.
    func test_sansHote_leChampLocalFaitFoi() {
        XCTAssertEqual(ComposerFieldAfterSend.resolve(local: "", host: nil, sender: .composer), "")
        XCTAssertEqual(ComposerFieldAfterSend.resolve(local: "Bonjour", host: nil, sender: .host), "Bonjour")
    }

    // MARK: - Qui a envoyé se DIT, il ne se devine pas

    /// `onCustomSend` fourni ⇒ l'hôte tient l'envoi et le vidage ; absent ⇒ la
    /// barre envoie et vide elle-même.
    func test_lExpediteur_seLitSurOnCustomSend() {
        XCTAssertEqual(ComposerFieldAfterSend.Sender(hasCustomSend: true), .host)
        XCTAssertEqual(ComposerFieldAfterSend.Sender(hasCustomSend: false), .composer)
    }

    /// **Garde de source.** Le chemin de la touche Retour doit dire QUI a envoyé
    /// en le lisant sur `onCustomSend`. Interdit : relire la source de l'hôte
    /// sans ce paramètre — c'est déduire « l'hôte a refusé » de « l'hôte n'a
    /// pas vidé », ce qui ressuscite le texte envoyé chez tout hôte
    /// `onSendMessage:` (#9311). Interdit aussi : retirer la règle, ce qui
    /// rendrait au chemin `onCustomSend` la perte d'une saisie refusée (#5326).
    func test_laToucheRetour_ditQuiAEnvoye() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/UniversalComposerBar+Recording.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
            .components(separatedBy: .whitespacesAndNewlines).joined()
        guard let envoi = code.range(of: "handleSend()"),
              let regle = code.range(of: "ComposerFieldAfterSend.resolve(", range: envoi.upperBound..<code.endIndex)
        else {
            return XCTFail("La touche Retour ne consulte plus `ComposerFieldAfterSend` après `handleSend()` : "
                           + "un envoi refusé par l'hôte effacerait la saisie (#5326).")
        }
        let suite = code[regle.upperBound...].prefix(160)
        XCTAssertTrue(suite.contains("sender:.init(hasCustomSend:onCustomSend!=nil)"),
                      "La règle doit savoir si l'hôte a pris l'envoi (`onCustomSend`) : sans quoi une source "
                      + "jamais vidée se lit comme un refus et le texte envoyé ressuscite (#9311).")
    }
}
