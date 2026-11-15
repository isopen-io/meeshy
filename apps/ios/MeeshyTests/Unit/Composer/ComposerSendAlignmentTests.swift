import XCTest
@testable import Meeshy

/// **Le champ ressuscitait son texte juste après l'envoi** (#5961).
///
/// `UniversalComposerBar.text` est un `@State` LOCAL, synchronisé vers
/// `textBinding` (la source que l'hôte lit) par un `.adaptiveOnChange(of: text)`
/// — donc APRÈS le tour de run loop courant.
///
/// `handleSend()` appelle `onCustomSend()` SYNCHRONEMENT puis **sort sans
/// vider `text`** : la conversation câble `onCustomSend`, c'est donc le chemin
/// nominal du bouton d'envoi. L'hôte vide sa source (`composerText.text = ""`),
/// et la synchro différée re-pousse ENSUITE l'ancien `text` dedans. Le texte
/// réapparaît, l'auteur tape la suite, et l'envoi suivant emporte tout :
///
///     12:22  « je vois\nMince\nOk »
///     12:29  « je vois\nMince\nOk\nG »
///
/// Le dépôt CONNAISSAIT ce piège : le doc-comment de `sendQuickEmoji` le décrit
/// mot pour mot et le referme — pour l'emoji seul. Son voisin, le geste
/// d'envoi ordinaire, ne l'a jamais reçu.
///
/// **La règle aligne, elle ne vide pas.** Vider inconditionnellement perdrait
/// la saisie quand l'hôte REFUSE l'envoi (une édition qu'il garde pour
/// correction). On ne s'aligne que sur une décision déjà prise par l'hôte :
/// s'il a vidé sa source, la barre le suit.
@MainActor
final class ComposerSendAlignmentTests: XCTestCase {

    func test_lHoteAVideSaSource_laBarreSAligne() {
        XCTAssertTrue(
            ComposerSendAlignment.shouldClearLocalText(hostText: "", localText: "je vois"),
            "Sans cet alignement, la synchro différée re-pousse « je vois » après l'envoi et le message suivant l'emporte."
        )
    }

    func test_lHoteAGardeLeTexte_laBarreNeVidePas() {
        XCTAssertFalse(
            ComposerSendAlignment.shouldClearLocalText(hostText: "je vois", localText: "je vois"),
            "Un hôte qui REFUSE l'envoi garde sa source : vider ici perdrait la saisie."
        )
    }

    /// Pas de `textBinding` — la barre est son propre hôte (composer de story,
    /// aperçu). Rien à aligner : c'est `handleSend` lui-même qui vide.
    func test_sansHote_rienAAligner() {
        XCTAssertFalse(ComposerSendAlignment.shouldClearLocalText(hostText: nil, localText: "abc"))
    }

    /// Le champ est déjà vide : l'alignement ne doit pas produire d'écriture,
    /// qui relancerait un `onChange` pour rien à chaque envoi.
    func test_champDejaVide_aucuneEcriture() {
        XCTAssertFalse(ComposerSendAlignment.shouldClearLocalText(hostText: "", localText: ""))
    }
}
