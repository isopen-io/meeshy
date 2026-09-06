import XCTest
@testable import Meeshy

/// **Après un envoi, le champ vaut ce que l'HÔTE dit qu'il vaut** (directive
/// porteur 2026-09-06, #5326).
///
/// Ces témoins gardent la direction de l'erreur. Vider le champ sans condition
/// aurait effacé un texte que l'hôte vient de REFUSER d'envoyer (upload en
/// cours, contenu jugé vide) : l'auteur perdrait sa saisie sans rien avoir
/// envoyé. Le garder sans condition le ressuscite après un envoi réussi.
final class ComposerFieldAfterSendTests: XCTestCase {

    /// L'hôte a pris le texte et vidé sa source : le champ suit.
    func test_lHoteAVide_leChampSeVide() {
        XCTAssertEqual(ComposerFieldAfterSend.resolve(local: "Bonjour", host: ""), "")
    }

    /// **LE témoin du lot.** L'hôte a refusé l'envoi — il n'a pas touché à sa
    /// source, qui porte encore le texte poussé juste avant. Le champ le garde.
    func test_lHoteARefuse_leChampGardeLeTexte() {
        XCTAssertEqual(ComposerFieldAfterSend.resolve(local: "Bonjour", host: "Bonjour"), "Bonjour")
    }

    /// L'hôte a substitué autre chose (brouillon restauré, texte corrigé) : sa
    /// valeur gagne, parce qu'il EST la source du champ dès qu'il en tient une.
    func test_lHoteASubstitue_saValeurGagne() {
        XCTAssertEqual(ComposerFieldAfterSend.resolve(local: "Bonjour", host: "Bonsoir"), "Bonsoir")
    }

    /// Sans hôte, le composer est seul maître : `handleSend` a déjà vidé son
    /// propre état, et la règle ne le contredit pas.
    func test_sansHote_leChampLocalFaitFoi() {
        XCTAssertEqual(ComposerFieldAfterSend.resolve(local: "", host: nil), "")
        XCTAssertEqual(ComposerFieldAfterSend.resolve(local: "Bonjour", host: nil), "Bonjour")
    }
}
