import XCTest
@testable import MeeshySDK

/// Quelle version linguistique le lecteur a-t-il RÉELLEMENT sous les yeux.
///
/// Miroir de `apps/web/utils/consumed-language.ts` : les deux implémentations
/// doivent répondre identiquement, faute de quoi le même message serait
/// comptabilisé dans deux langues différentes selon la plateforme du lecteur.
///
/// La règle suit exactement celle qui choisit le TEXTE affiché
/// (`resolveUserLanguage` côté shared) : c'est la seule façon de ne pas
/// déclarer une langue que le lecteur n'a jamais vue.
///
/// Voir `docs/superpowers/specs/2026-07-24-media-views-enrichment-design.md`.
final class ConsumedLanguageResolverTests: XCTestCase {

    // MARK: - L'original prime

    func test_originalInPreferredLanguages_readsTheOriginal() {
        // Traduire un texte déjà dans la langue du lecteur n'aurait aucun sens :
        // c'est l'original qu'il voit.
        XCTAssertEqual(
            ConsumedLanguageResolver.resolve(
                originalLanguage: "fr",
                availableTranslations: ["en"],
                preferredLanguages: ["fr", "en"]
            ),
            "fr"
        )
    }

    func test_originalWins_evenWhenATranslationExistsInAPreferredLanguage() {
        XCTAssertEqual(
            ConsumedLanguageResolver.resolve(
                originalLanguage: "en",
                availableTranslations: ["fr"],
                preferredLanguages: ["en", "fr"]
            ),
            "en"
        )
    }

    // MARK: - Sinon, la première préférence traduite

    func test_firstPreferredTranslation_wins() {
        XCTAssertEqual(
            ConsumedLanguageResolver.resolve(
                originalLanguage: "de",
                availableTranslations: ["en", "fr"],
                preferredLanguages: ["fr", "en"]
            ),
            "fr"
        )
    }

    func test_preferenceOrder_decides() {
        XCTAssertEqual(
            ConsumedLanguageResolver.resolve(
                originalLanguage: "de",
                availableTranslations: ["en", "fr"],
                preferredLanguages: ["en", "fr"]
            ),
            "en"
        )
    }

    func test_skipsPreferencesWithoutTranslation() {
        XCTAssertEqual(
            ConsumedLanguageResolver.resolve(
                originalLanguage: "de",
                availableTranslations: ["fr"],
                preferredLanguages: ["es", "it", "fr"]
            ),
            "fr"
        )
    }

    // MARK: - Le repli est l'original, jamais une langue tierce

    func test_noPreferredTranslation_fallsBackToTheOriginal() {
        // C'est le cas qui rend la langue par message indispensable : le lecteur
        // préfère l'anglais mais voit de l'allemand, faute de traduction.
        XCTAssertEqual(
            ConsumedLanguageResolver.resolve(
                originalLanguage: "de",
                availableTranslations: ["it"],
                preferredLanguages: ["en"]
            ),
            "de"
        )
    }

    func test_neverFallsBackToAnUnrelatedTranslation() {
        let resolved = ConsumedLanguageResolver.resolve(
            originalLanguage: "de",
            availableTranslations: ["it", "es"],
            preferredLanguages: ["en"]
        )
        XCTAssertEqual(resolved, "de")
        XCTAssertNotEqual(resolved, "it")
    }

    func test_noTranslationsAtAll_readsTheOriginal() {
        XCTAssertEqual(
            ConsumedLanguageResolver.resolve(
                originalLanguage: "de",
                availableTranslations: [],
                preferredLanguages: ["en"]
            ),
            "de"
        )
    }

    func test_noPreferences_readsTheOriginal() {
        XCTAssertEqual(
            ConsumedLanguageResolver.resolve(
                originalLanguage: "de",
                availableTranslations: ["en"],
                preferredLanguages: []
            ),
            "de"
        )
    }

    // MARK: - Normalisation

    func test_localeIdentifiers_areNormalized() {
        // iOS fournit `Locale.current.identifier`, donc `fr_FR`.
        XCTAssertEqual(
            ConsumedLanguageResolver.resolve(
                originalLanguage: "de",
                availableTranslations: ["fr-FR"],
                preferredLanguages: ["fr_FR"]
            ),
            "fr"
        )
    }

    func test_caseIsIgnored() {
        XCTAssertEqual(
            ConsumedLanguageResolver.resolve(
                originalLanguage: "FR",
                availableTranslations: [],
                preferredLanguages: ["fr"]
            ),
            "fr"
        )
    }

    func test_threeLetterCodes_areNotTruncated() {
        // `bas` tronqué donnerait `ba` (Bachkir), langue sans rapport.
        XCTAssertEqual(
            ConsumedLanguageResolver.resolve(
                originalLanguage: "fr",
                availableTranslations: ["bas"],
                preferredLanguages: ["bas"]
            ),
            "bas"
        )
    }

    // MARK: - Rien à déclarer

    func test_unknownOriginal_andNoMatch_yieldsNothing() {
        // Mieux vaut ne rien rapporter qu'inventer une langue.
        XCTAssertNil(
            ConsumedLanguageResolver.resolve(
                originalLanguage: nil,
                availableTranslations: ["it"],
                preferredLanguages: ["en"]
            )
        )
    }

    func test_unknownOriginal_butAPreferredTranslationExists() {
        XCTAssertEqual(
            ConsumedLanguageResolver.resolve(
                originalLanguage: nil,
                availableTranslations: ["en"],
                preferredLanguages: ["en"]
            ),
            "en"
        )
    }

    func test_illegibleOriginal_yieldsNothing() {
        XCTAssertNil(
            ConsumedLanguageResolver.resolve(
                originalLanguage: "@@@",
                availableTranslations: [],
                preferredLanguages: ["en"]
            )
        )
    }

    // MARK: - Bascule manuelle

    func test_manualSelection_overridesEverything() {
        // Le lecteur a explicitement ouvert une autre version : c'est celle-là
        // qu'il a vue, quelles que soient ses préférences.
        XCTAssertEqual(
            ConsumedLanguageResolver.resolve(
                originalLanguage: "fr",
                availableTranslations: ["en", "es"],
                preferredLanguages: ["fr"],
                manualSelection: "es"
            ),
            "es"
        )
    }

    func test_manualSelectionOfAnAbsentVersion_isIgnored() {
        XCTAssertEqual(
            ConsumedLanguageResolver.resolve(
                originalLanguage: "fr",
                availableTranslations: ["en"],
                preferredLanguages: ["fr"],
                manualSelection: "es"
            ),
            "fr"
        )
    }

    func test_manualSelectionOfTheOriginal_isHonored() {
        XCTAssertEqual(
            ConsumedLanguageResolver.resolve(
                originalLanguage: "fr",
                availableTranslations: ["en"],
                preferredLanguages: ["en"],
                manualSelection: "fr"
            ),
            "fr"
        )
    }
}
