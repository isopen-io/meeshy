import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Prisme Linguistique — langue source par défaut du composer de story.
///
/// Directive produit 2026-07-30 (public cible premier : la France) : tout
/// élément fraîchement créé (texte, média, audio) et la story elle-même
/// démarrent en FRANÇAIS, à parité avec la barre universelle
/// (`DefaultComposerLanguage` côté app). Ni la locale appareil, ni le clavier
/// actif, ni les préférences de LECTURE (`systemLanguage`/`regionalLanguage`)
/// ne pilotent ce défaut — chacun de ces signaux a déjà mal étiqueté du
/// contenu français (clavier anglais en tête de liste, app réglée en anglais).
/// Le choix EXPLICITE de l'auteur via la pastille langue de l'éditeur de
/// texte (`updateElementLanguage`, directive 2026-07-25) reste le seul
/// mécanisme qui remplace ce défaut.
final class StoryComposerView_LanguageResolutionTests: XCTestCase {

    func test_defaultSourceLanguage_isFrench() {
        XCTAssertEqual(
            StoryComposerViewModel.defaultSourceLanguage, "fr",
            "Le composer story doit démarrer en français (directive 2026-07-30)"
        )
    }

    /// Un nouvel élément texte doit naître avec le défaut français — c'est le
    /// comportement observable qui découle du défaut, pas un détail interne.
    @MainActor
    func test_addText_stampsFrenchAsSourceLanguage() {
        let vm = StoryComposerViewModel()

        let created = vm.addText()

        XCTAssertEqual(
            created?.sourceLanguage, "fr",
            "Un texte fraîchement posé doit être étiqueté français par défaut"
        )
        XCTAssertEqual(
            vm.currentEffects.textObjects.last?.sourceLanguage, "fr",
            "Le texte posé dans les effets porte le même défaut français"
        )
    }
}
