import XCTest
import UIKit
@testable import Meeshy

/// #6751 — **LA BARRE DE RÉPONSE SE POSE AU-DESSUS DU CLAVIER.**
///
/// Constat porteur : « commenter en citant un media affiche le clavier et cache
/// le texte en écriture ». L'intention était pourtant écrite dans le code —
/// `replyComposerLayer` est la seule couche du `ZStack` à ne pas ignorer la zone
/// sûre du clavier, « c'est elle qu'on tape ». Ce qui manquait n'est pas
/// l'intention, c'est que le `ZStack` fait la hauteur de l'ÉCRAN : quatre de ses
/// cinq couches l'étendent (`.ignoresSafeArea()`), et une couche alignée en bas
/// d'un cadre pleine hauteur se pose DERRIÈRE le clavier.
///
/// La règle est donc EXPLICITE et pure : on ne délègue plus l'inset à
/// l'ajustement automatique de SwiftUI, qui ne s'applique pas ici.
@MainActor
final class MediaReplyKeyboardInsetTests: XCTestCase {

    private func transition(_ height: CGFloat) -> KeyboardTransition {
        KeyboardTransition(height: height, duration: 0.25, curve: .curveEaseInOut)
    }

    // MARK: - L'inset

    func test_clavierLeve_laBarreMonteDeSaHauteur() {
        XCTAssertEqual(MediaReplyKeyboardInset.bottomInset(for: transition(336)), 336)
    }

    func test_aucuneTransition_aucunInset() {
        XCTAssertEqual(MediaReplyKeyboardInset.bottomInset(for: nil), 0)
    }

    /// Un `keyboardWillHide` porte une hauteur de 0 : la barre redescend au ras
    /// du média, elle ne garde pas la réserve du clavier qui vient de partir.
    func test_clavierMasque_laBarreRedescend() {
        XCTAssertEqual(MediaReplyKeyboardInset.bottomInset(for: transition(0)), 0)
    }

    /// **Le rang le plus load-bearing** : un clavier matériel (ou une barre de
    /// suggestions seule) annonce une hauteur MINUSCULE. La règle ne doit pas la
    /// traiter comme « pas de clavier » — sinon la barre reste dessous, ce qui
    /// est exactement le défaut d'origine, en plus rare et donc plus durable.
    func test_uneHauteurMinuscule_estQuandMemeUnInset() {
        XCTAssertEqual(MediaReplyKeyboardInset.bottomInset(for: transition(55)), 55)
    }

    /// Une hauteur négative n'existe pas ; si UIKit en sert une (frame hors
    /// écran sur un iPad en Slide Over), elle ne doit pas TIRER la barre vers le
    /// bas, hors de l'écran.
    func test_uneHauteurNegative_neTirePasLaBarreHorsEcran() {
        XCTAssertEqual(MediaReplyKeyboardInset.bottomInset(for: transition(-40)), 0)
    }

    // MARK: - La VALIDATION rend l'écran au média

    /// L'envoi retire la barre ET le clavier, et dans CET ordre : le clavier
    /// d'abord. Une barre retirée pendant que le clavier descend laisse voir un
    /// trou sous elle le temps du mouvement ; l'inverse est un seul geste.
    ///
    /// Un booléen `dismissesKeyboardOnSend` aurait été un témoin incapable de
    /// tomber — une constante ne mesure rien. Ce qui se mesure, c'est la SUITE
    /// d'effets que l'hôte doit appliquer.
    func test_lEnvoi_ferme_le_clavier_PUIS_retire_la_barre() {
        XCTAssertEqual(MediaReplyKeyboardInset.sendEffects, [.dismissKeyboard, .hideComposer])
    }

    /// L'ANNULATION n'a pas à fermer le clavier avant de retirer la barre : le
    /// retrait de la barre emporte son champ de saisie, donc le clavier avec.
    /// Le distinguer de l'envoi est ce qui empêche d'écrire « deux effets
    /// partout » sans se demander ce que chacun coûte.
    func test_lAnnulation_retire_la_barre_sans_sequence_de_clavier() {
        XCTAssertEqual(MediaReplyKeyboardInset.cancelEffects, [.hideComposer])
    }
}
