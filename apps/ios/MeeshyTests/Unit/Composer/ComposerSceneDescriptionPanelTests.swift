import XCTest
@testable import Meeshy

/// #4742 — **la description se lit sous la scène et se replie.**
///
/// > « Le texte de description doit se mettre dans la scène pliable avec un
/// > bouton V tout en bas de la scène tout de suite en dessous, et qui devient
/// > ^ après le repli pour afficher de nouveau. » — porteur, 2026-09-01
@MainActor
final class ComposerSceneDescriptionPanelTests: XCTestCase {

    /// La directive, littéralement : `V` déplié, `^` replié.
    func test_leChevron_pointeVersLeBas_deplié_etVersLeHaut_replié() {
        XCTAssertEqual(ComposerSceneDescriptionPanel.chevronSymbol(isCollapsed: false), "chevron.down")
        XCTAssertEqual(ComposerSceneDescriptionPanel.chevronSymbol(isCollapsed: true), "chevron.up")
    }

    /// **Le libellé dit l'ACTION, jamais l'état.** Un lecteur d'écran ne voit
    /// pas le chevron : « description repliée » le laisserait deviner ce qu'un
    /// appui ferait.
    func test_leLibelléVoiceOver_ditLActionEtNonLÉtat() {
        let replié = ComposerSceneDescriptionPanel.chevronLabel(isCollapsed: true)
        let déplié = ComposerSceneDescriptionPanel.chevronLabel(isCollapsed: false)

        XCTAssertNotEqual(replié, déplié, "les deux états doivent se dire différemment")
        XCTAssertFalse(replié.isEmpty)
        XCTAssertFalse(déplié.isEmpty)
        // Le libellé ne récite pas le nom du glyphe : « chevron.up » se
        // prononce mal, et une chaîne qui sert l'œil ET la voix n'en sert qu'un.
        XCTAssertFalse(replié.contains("chevron"))
        XCTAssertFalse(déplié.contains("chevron"))
    }

    /// **Le volet s'efface pendant la SAISIE.** L'éditeur affiche déjà le
    /// texte ; le laisser derrière montrerait la description en double.
    ///
    /// Garde de source : le meuble n'est pas hostable en XCTest, et c'est LUI
    /// qui décide de servir le volet ou non.
    func test_leVolet_neSeSertPasPendantLaSaisie() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        let compact = source.components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(compact.contains("guard!editsSceneDescriptionelse{returnnil}"),
                      "Le volet doit disparaître pendant la saisie — sinon la description paraît deux fois.")
    }

    /// **Ouvrir la saisie DÉPLIE le volet.** Écrire dans un volet rangé
    /// laisserait l'auteur taper sans voir ce qu'il écrit.
    func test_ouvrirLaSaisie_déplieLeVolet() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        let compact = source.components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(compact.contains("sceneDescriptionCollapsed=falseeditsSceneDescription=true"),
                      "L'ordre compte : déplier AVANT d'ouvrir la saisie.")
    }
}
