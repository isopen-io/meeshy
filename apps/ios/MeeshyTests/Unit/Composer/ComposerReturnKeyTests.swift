import XCTest
@testable import Meeshy

/// **La touche RETOUR envoie — mais pas un collage** (directive porteur
/// 2026-09-05).
///
/// Ces témoins gardent la seconde condition de la règle, celle qui n'est pas
/// évidente : un texte qui se termine par un saut de ligne n'est pas
/// nécessairement un appui sur Retour. Sans elle, coller un extrait d'e-mail
/// enverrait le message — et un envoi non demandé ne se reprend pas.
final class ComposerReturnKeyTests: XCTestCase {

    // MARK: - Ce qui ENVOIE

    /// Le cas nominal : un doigt sur Retour, au bout d'un mot.
    func test_unSautDeLigneTape_envoie() {
        XCTAssertTrue(ComposerReturnKey.submits(previous: "Salut", current: "Salut\n"))
    }

    /// Sur un texte VIDE aussi — la règle ne juge pas s'il y a quelque chose à
    /// envoyer, c'est `handleSend` qui le fait. Deux gardes du même fait
    /// divergeraient : celle-ci répond « est-ce un appui sur Retour ? », l'autre
    /// « y a-t-il de quoi partir ? ».
    func test_unSautDeLigneSurUnTexteVide_estQuandMemeUnAppui() {
        XCTAssertTrue(ComposerReturnKey.submits(previous: "", current: "\n"))
    }

    /// Un texte qui contient DÉJÀ des sauts de ligne — l'auteur est allé à la
    /// ligne, puis appuie encore. La règle compte les caractères, pas les
    /// lignes.
    func test_unSecondSautDeLigne_envoieAussi() {
        XCTAssertTrue(ComposerReturnKey.submits(previous: "a\nb", current: "a\nb\n"))
    }

    // MARK: - Ce qui N'ENVOIE PAS

    /// **LE témoin du lot.** Un collage multi-lignes se terminant par un retour
    /// — un extrait d'e-mail, une note — a la même TERMINAISON qu'une frappe et
    /// une tout autre intention.
    ///
    /// > La direction de l'erreur est choisie : dans le doute, on NE PART PAS.
    /// > Rater un envoi coûte une touche ; envoyer par erreur coûte un message
    /// > que le destinataire a déjà vu passer.
    func test_unCollageMultiLignes_nEnvoiePas() {
        XCTAssertFalse(ComposerReturnKey.submits(previous: "",
                                                 current: "Bonjour,\n\nVoici le devis.\n"))
    }

    /// Un collage qui s'ajoute à un texte existant — même règle, autre point de
    /// départ. Le témoin existe parce que le premier ne l'aurait pas attrapé :
    /// il part d'un champ vide, où la longueur précédente est zéro.
    func test_unCollageApresUnTexte_nEnvoiePas() {
        XCTAssertFalse(ComposerReturnKey.submits(previous: "Note : ",
                                                 current: "Note : deux lignes\ncollées\n"))
    }

    /// Une frappe ordinaire ne se termine pas par un saut de ligne.
    func test_uneFrappeOrdinaire_nEnvoiePas() {
        XCTAssertFalse(ComposerReturnKey.submits(previous: "Salu", current: "Salut"))
    }

    /// **Une SUPPRESSION ne peut pas envoyer**, même si ce qui reste finit par
    /// un saut de ligne. Sans la comparaison de longueurs, effacer le dernier
    /// mot d'un texte multi-lignes aurait envoyé le message.
    func test_uneSuppression_nEnvoiePas() {
        XCTAssertFalse(ComposerReturnKey.submits(previous: "a\nbc", current: "a\n"))
    }

    /// Un texte INCHANGÉ ne déclenche rien — le rappel de changement peut être
    /// rejoué par une passe de rendu sans que le texte ait bougé.
    func test_unTexteInchange_nEnvoiePas() {
        XCTAssertFalse(ComposerReturnKey.submits(previous: "a\n", current: "a\n"))
    }

    // MARK: - Ce que le champ ENVOIE réellement

    /// Le saut de ligne ne part PAS avec le message : il est l'appui, pas le
    /// contenu.
    func test_leSautDeLigne_estRetireAvantEnvoi() {
        XCTAssertEqual(ComposerReturnKey.stripped("Salut\n"), "Salut")
    }

    /// Et le retrait ne mord jamais sur un texte qui n'en a pas — c'est ce qui
    /// permet de l'appeler sans avoir à reposer la question.
    func test_unTexteSansSautDeLigne_resteIntact() {
        XCTAssertEqual(ComposerReturnKey.stripped("Salut"), "Salut")
        XCTAssertEqual(ComposerReturnKey.stripped(""), "")
    }

    /// Un SEUL saut est retiré : « a\n\n » est un texte à ligne vide suivi d'un
    /// appui, et la ligne vide appartient à l'auteur.
    func test_unSeulSautEstRetire() {
        XCTAssertEqual(ComposerReturnKey.stripped("a\n\n"), "a\n")
    }
}
