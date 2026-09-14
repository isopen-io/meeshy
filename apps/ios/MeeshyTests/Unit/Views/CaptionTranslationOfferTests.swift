import XCTest
@testable import Meeshy

/// CE QU'ON OFFRE ENTRE LA LÉGENDE ET « VOIR MOINS » (#6504).
///
/// Directive porteur 2026-09-14 : « mettre entre les deux l'icône de traduction,
/// la sélection de la langue d'affichage s'il existe des traductions déjà, ou
/// l'icône pour traduire immédiatement ».
///
/// La règle est PURE : la vue n'a qu'à rendre ce qu'elle décide. Et elle refuse
/// d'offrir un contrôle qui ne ferait rien — un sélecteur à une seule langue, un
/// « traduire » vers la langue dans laquelle la légende est déjà écrite (loi 4).
final class CaptionTranslationOfferTests: XCTestCase {

    func test_desTraductionsExistent_onOffreLeSelecteur_origineEnTete() {
        let offre = CaptionTranslationOffer.resolve(
            originalLanguage: "fr",
            translationLanguages: ["es", "en"],
            preferredLanguages: ["en"],
            activeLanguage: "en"
        )

        XCTAssertEqual(offre, .languages(codes: ["fr", "en", "es"], active: "en"))
    }

    func test_aucuneTraduction_onOffreDeTraduireVersLaPremiereLanguePrefereeAutreQueLOrigine() {
        let offre = CaptionTranslationOffer.resolve(
            originalLanguage: "en",
            translationLanguages: [],
            preferredLanguages: ["en", "fr"],
            activeLanguage: nil
        )

        XCTAssertEqual(offre, .translateNow(target: "fr"))
    }

    /// La légende est déjà dans la seule langue du lecteur : « traduire » ne
    /// changerait rien. Aucune offre plutôt qu'un bouton inerte.
    func test_laLegendeEstDejaDansLaLangueDuLecteur_onNOffreRien() {
        let offre = CaptionTranslationOffer.resolve(
            originalLanguage: "fr",
            translationLanguages: [],
            preferredLanguages: ["FR"],
            activeLanguage: nil
        )

        XCTAssertEqual(offre, .none)
    }

    func test_sansLanguePreferee_etSansTraduction_onNOffreRien() {
        let offre = CaptionTranslationOffer.resolve(
            originalLanguage: "fr",
            translationLanguages: [],
            preferredLanguages: [],
            activeLanguage: nil
        )

        XCTAssertEqual(offre, .none)
    }

    /// Une traduction vers la langue d'origine elle-même ne fait pas un choix :
    /// le sélecteur ne s'offre qu'à partir de DEUX langues distinctes.
    func test_uneSeuleLangueDistincte_onNOffrePasDeSelecteur() {
        let offre = CaptionTranslationOffer.resolve(
            originalLanguage: "fr",
            translationLanguages: ["FR"],
            preferredLanguages: ["fr"],
            activeLanguage: nil
        )

        XCTAssertEqual(offre, .none)
    }

    func test_lesCodesSontDedoublonnesSansTenirCompteDeLaCasse() {
        let offre = CaptionTranslationOffer.resolve(
            originalLanguage: "fr",
            translationLanguages: ["EN", "en", "es"],
            preferredLanguages: ["fr"],
            activeLanguage: nil
        )

        XCTAssertEqual(offre, .languages(codes: ["fr", "EN", "es"], active: nil))
    }
}
