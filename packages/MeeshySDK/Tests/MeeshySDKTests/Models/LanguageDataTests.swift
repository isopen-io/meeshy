import XCTest
@testable import MeeshySDK

/// Locks in `LanguageData` as the single source of truth for iOS language
/// lists: one interface base, one translation base, with all per-language
/// metadata living in `allLanguages` only.
///
/// Step 1 of the iOS language-list unification (SDK core). The MeeshyUI /
/// app pickers will derive from these bases in a follow-up so the composer,
/// settings, onboarding, profile and translation pickers stop hardcoding
/// their own divergent lists.
final class LanguageDataTests: XCTestCase {

    // MARK: - Interface base

    func test_interfaceLanguages_matchesCanonicalSet() {
        // Aligned with the web INTERFACE_LANGUAGES set + Arabic.
        XCTAssertEqual(
            LanguageData.interfaceLanguages.map(\.code),
            ["en", "es", "fr", "pt", "de", "it", "ar"]
        )
    }

    func test_interfaceLanguages_metadataSourcedFromAllLanguages() {
        // The interface base must reuse the single metadata source, never
        // redefine names/flags/colors of its own.
        for language in LanguageData.interfaceLanguages {
            let canonical = LanguageData.allLanguages.first { $0.code == language.code }
            XCTAssertNotNil(canonical, "interface language \(language.code) missing from allLanguages")
            XCTAssertEqual(language.name, canonical?.name)
            XCTAssertEqual(language.nativeName, canonical?.nativeName)
            XCTAssertEqual(language.flag, canonical?.flag)
            XCTAssertEqual(language.colorHex, canonical?.colorHex)
        }
    }

    // MARK: - Translation base

    func test_allLanguages_includesCatalan() {
        let catalan = LanguageData.allLanguages.first { $0.code == "ca" }
        XCTAssertNotNil(catalan, "Catalan must stay in the translation base (was only in MeeshyUI's list)")
        XCTAssertEqual(catalan?.nativeName, "Català")
    }

    func test_allLanguages_codesAreUnique() {
        let codes = LanguageData.allLanguages.map(\.code)
        XCTAssertEqual(codes.count, Set(codes).count, "duplicate language codes in allLanguages")
    }

    // MARK: - Common-first ordering

    func test_allLanguagesCommonFirst_startsWithCommonCodes() {
        XCTAssertEqual(
            LanguageData.allLanguagesCommonFirst.prefix(LanguageData.commonLanguageCodes.count).map(\.code),
            LanguageData.commonLanguageCodes
        )
    }

    func test_allLanguagesCommonFirst_isAPermutationOfAllLanguages() {
        XCTAssertEqual(
            LanguageData.allLanguagesCommonFirst.count,
            LanguageData.allLanguages.count
        )
        XCTAssertEqual(
            Set(LanguageData.allLanguagesCommonFirst.map(\.code)),
            Set(LanguageData.allLanguages.map(\.code))
        )
    }

    func test_commonLanguageCodes_allExistInBase() {
        for code in LanguageData.commonLanguageCodes {
            XCTAssertNotNil(LanguageData.info(for: code), "common code \(code) missing from allLanguages")
        }
    }

    // MARK: - Quick translation base (composer pill)

    func test_quickTranslationLanguages_matchesCodesAndAllExist() {
        XCTAssertEqual(
            LanguageData.quickTranslationLanguages.map(\.code),
            LanguageData.quickTranslationCodes
        )
        // compactMap silently drops unknown codes — guard the curated list
        // can never reference a code absent from the translation base.
        XCTAssertEqual(
            LanguageData.quickTranslationLanguages.count,
            LanguageData.quickTranslationCodes.count
        )
    }

    // MARK: - Lookup + aliases

    func test_info_resolvesDirectCode() {
        XCTAssertEqual(LanguageData.info(for: "de")?.nativeName, "Deutsch")
    }

    func test_info_resolvesFilipinoAliasToTagalog() {
        // TranslationLanguage used "fil"; the translation base uses "tl".
        let filipino = LanguageData.info(for: "fil")
        XCTAssertEqual(filipino?.code, "tl")
    }

    func test_info_returnsNilForUnknownCode() {
        XCTAssertNil(LanguageData.info(for: "zz"))
    }

    // MARK: - L'Atlas des langues (#9388)

    /// Chaque langue que le passeport peut tamponner a ses métadonnées : sans entrée, son tampon
    /// retombait sur la couleur de marque et son nom sur le code en capitales.
    func test_everyAtlasLanguageHasItsMetadata() {
        for code in GameAtlas.catalog {
            XCTAssertNotNil(LanguageData.info(for: code), "la langue « \(code) » du passeport n'a aucune entrée dans LanguageData")
        }
    }

    func test_theFiveAtlasLanguagesThatWereMissingCarryTheirNativeAndEnglishNames() {
        let expected: [(code: String, name: String, native: String)] = [
            ("om", "Oromo", "Afaan Oromoo"),
            ("ti", "Tigrinya", "\u{1275}\u{130D}\u{122D}\u{129B}"),
            ("ny", "Chichewa", "Chinyanja"),
            ("ksf", "Bafia", "Rikpa"),
            ("nnh", "Ngiemboon", "Ngiemboon"),
        ]
        for item in expected {
            let info = LanguageData.info(for: item.code)
            XCTAssertEqual(info?.name, item.name, item.code)
            XCTAssertEqual(info?.nativeName, item.native, item.code)
            XCTAssertFalse(info?.flag.isEmpty ?? true, item.code)
        }
    }

    func test_anAtlasLanguageIsNotOfferedAsAnInterfaceLanguage() {
        for code in ["om", "ti", "ny", "ksf", "nnh"] {
            XCTAssertFalse(LanguageData.interfaceLanguageCodes.contains(code), code)
        }
    }
}
