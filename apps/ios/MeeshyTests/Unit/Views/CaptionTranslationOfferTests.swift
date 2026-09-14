import XCTest
@testable import Meeshy

/// CE QU'ON OFFRE ENTRE LA LÉGENDE ET « VOIR MOINS » (#6504).
///
/// Directive porteur 2026-09-14 : « mettre entre les deux l'icône de traduction,
/// la sélection de la langue d'affichage s'il existe des traductions déjà, ou
/// l'icône pour traduire immédiatement » — puis, le même jour : cette icône
/// « ouvre la feuille habituelle de traduction, celle des messages, des audios,
/// pour demander une traduction de ce contenu dans la langue souhaitée ».
///
/// La règle est PURE : la vue n'a qu'à rendre ce qu'elle décide. La feuille
/// propose TOUTES les langues : l'icône n'est donc jamais un contrôle inerte
/// dès que la langue d'origine est connue.
final class CaptionTranslationOfferTests: XCTestCase {

    func test_desTraductionsExistent_onOffreLeSelecteur_origineEnTete() {
        let offre = CaptionTranslationOffer.resolve(
            originalLanguage: "fr",
            translationLanguages: ["es", "en"],
            activeLanguage: "en"
        )

        XCTAssertEqual(offre, .languages(codes: ["fr", "en", "es"], active: "en"))
    }

    func test_aucuneTraduction_onOffreLIconeQuiOuvreLaFeuille() {
        let offre = CaptionTranslationOffer.resolve(
            originalLanguage: "en",
            translationLanguages: [],
            activeLanguage: nil
        )

        XCTAssertEqual(offre, .translate)
    }

    /// Une traduction vers la langue d'origine elle-même ne fait pas un choix :
    /// le sélecteur ne s'offre qu'à partir de DEUX langues distinctes — la
    /// feuille, elle, reste offerte.
    func test_uneSeuleLangueDistincte_onOffreLaFeuille_pasLeSelecteur() {
        let offre = CaptionTranslationOffer.resolve(
            originalLanguage: "fr",
            translationLanguages: ["FR"],
            activeLanguage: nil
        )

        XCTAssertEqual(offre, .translate)
    }

    /// Sans langue d'origine, la feuille n'a ni « Original » à nommer ni langue
    /// source à transmettre : rien n'est offert.
    func test_sansLangueDOrigine_niTraduction_onNOffreRien() {
        let offre = CaptionTranslationOffer.resolve(
            originalLanguage: nil,
            translationLanguages: [],
            activeLanguage: nil
        )

        XCTAssertEqual(offre, .none)
    }

    // MARK: - Le texte affiché suit la langue active

    /// Recette 2026-09-14 : le plein écran marquait « Français » actif et
    /// affichait le portugais — le texte venait de `translatedContent`, le
    /// drapeau d'une autre résolution. Le texte se lit désormais DEPUIS la
    /// langue active : une seule résolution pour les deux.
    func test_laLangueActiveEstLOriginal_leTexteEstLeContenu() {
        let texte = CaptionTranslationOffer.carrierText(
            content: "Le vent se lève",
            originalLanguage: "fr",
            translations: ["pt": "O vento sobe"],
            language: "FR"
        )

        XCTAssertEqual(texte, "Le vent se lève")
    }

    func test_laLangueActiveEstTraduite_leTexteEstSaTraduction() {
        let texte = CaptionTranslationOffer.carrierText(
            content: "Le vent se lève",
            originalLanguage: "fr",
            translations: ["PT": "O vento sobe"],
            language: "pt"
        )

        XCTAssertEqual(texte, "O vento sobe")
    }

    /// Une langue sans texte connu ne rend jamais une légende vide : le contenu.
    func test_uneLangueSansTraduction_rendLeContenu() {
        let texte = CaptionTranslationOffer.carrierText(
            content: "Le vent se lève",
            originalLanguage: "fr",
            translations: ["pt": "O vento sobe"],
            language: "de"
        )

        XCTAssertEqual(texte, "Le vent se lève")
    }

    func test_lesCodesSontDedoublonnesSansTenirCompteDeLaCasse() {
        let offre = CaptionTranslationOffer.resolve(
            originalLanguage: "fr",
            translationLanguages: ["EN", "en", "es"],
            activeLanguage: nil
        )

        XCTAssertEqual(offre, .languages(codes: ["fr", "EN", "es"], active: nil))
    }
}
