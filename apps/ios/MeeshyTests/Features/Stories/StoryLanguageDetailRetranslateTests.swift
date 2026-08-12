import XCTest
@testable import Meeshy

/// Retour visuel du bouton « Retraduire » de la feuille des langues.
///
/// Une langue DÉJÀ traduite garde son aperçu : l'attente ne pouvait donc pas se
/// déduire de « pas encore de traduction », comme pour « Traduire ». Résultat,
/// le bouton « Retraduire » ne donnait aucun signe de vie — d'autant qu'avant le
/// forçage il ne déclenchait rien du tout côté gateway.
///
/// L'attente se dérive du TEXTE : on mémorise celui affiché au moment de la
/// demande, l'anneau tourne tant qu'il n'a pas bougé. La nouvelle traduction
/// arrivant par socket, l'anneau s'éteint de lui-même — aucun drapeau à
/// éteindre à la main.
final class StoryLanguageDetailRetranslateTests: XCTestCase {

    func test_isRetranslating_noBaseline_false() {
        XCTAssertFalse(
            StoryLanguageDetailView.isRetranslating(baseline: nil, currentText: "Bonjour")
        )
    }

    func test_isRetranslating_textUnchangedSinceRequest_true() {
        XCTAssertTrue(
            StoryLanguageDetailView.isRetranslating(baseline: "Bonjour", currentText: "Bonjour")
        )
    }

    func test_isRetranslating_textChanged_false() {
        // Le socket a livré la nouvelle traduction : l'anneau doit s'éteindre.
        XCTAssertFalse(
            StoryLanguageDetailView.isRetranslating(baseline: "Bonjour", currentText: "Salut")
        )
    }

    func test_isRetranslating_translationDisappeared_false() {
        // Cas dégénéré (traduction retirée en base) : ne pas laisser un anneau
        // orphelin tourner sur une ligne qui n'a plus d'aperçu.
        XCTAssertFalse(
            StoryLanguageDetailView.isRetranslating(baseline: "Bonjour", currentText: nil)
        )
    }

    // MARK: - La sentinelle « Original » ne doit pas fuir dans l'UI
    //
    // `activeLanguageCode` porte la sentinelle quand l'utilisateur a choisi
    // « Original ». L'en-tête de la carte la passait telle quelle au résolveur
    // de nom, qui retombe sur `code.uppercased()` pour tout code inconnu : la
    // feuille aurait affiché « __MEESHY.ORIGINAL__ » comme nom de langue, et la
    // même chose dans la pastille du code.

    func test_displayCode_realLanguage_passesThrough() {
        XCTAssertEqual(StoryLanguageDetailView.displayCode(for: "fr"), "fr")
    }

    func test_displayCode_nil_isEmpty() {
        XCTAssertEqual(StoryLanguageDetailView.displayCode(for: nil), "")
    }

    func test_displayCode_originalSentinel_isEmpty() {
        XCTAssertEqual(
            StoryLanguageDetailView.displayCode(for: StoryViewerView.originalLanguageOverride),
            ""
        )
    }

    func test_languageName_forSentinelDerivedEmptyCode_readsOriginal() {
        // Un code vide est déjà le cas « Original » du résolveur de nom : la
        // sentinelle s'y ramène au lieu de produire un nom fabriqué.
        let name = StoryLanguageDetailView.languageName(
            for: StoryLanguageDetailView.displayCode(for: StoryViewerView.originalLanguageOverride)
        )
        XCTAssertFalse(name.contains("MEESHY"))
    }
}
