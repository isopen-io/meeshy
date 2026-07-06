import XCTest
@testable import MeeshySDK

/// Phase 3 — covers the 4th-priority `deviceLocale` axis added to
/// `MeeshyUser.preferredContentLanguages`. The order MUST stay
/// `systemLanguage → regionalLanguage → customDestinationLanguage → deviceLocale → "fr"`
/// per the Prisme Linguistique design (spec
/// `docs/superpowers/specs/2026-05-26-device-locale-fourth-priority-design.md`).
///
/// Distinct from `MeeshyUserTests.swift` (which exercises the legacy 3-level
/// surface): this file is dedicated to the new axis so a future refactor of
/// the field can find and update both files together.
final class MeeshyUserPreferredContentLanguagesTests: XCTestCase {

    // MARK: - Order

    func test_preferredContentLanguages_includesDeviceLocale_inFourthPosition() {
        let user = MeeshyUser(
            id: "u1", username: "alice",
            systemLanguage: "fr",
            regionalLanguage: "es",
            customDestinationLanguage: "pt",
            deviceLocale: "it"
        )
        XCTAssertEqual(user.preferredContentLanguages, ["fr", "es", "pt", "it"])
    }

    // MARK: - Dedup

    func test_preferredContentLanguages_dedupesDeviceLocale_matchingSystem() {
        let user = MeeshyUser(
            id: "u1", username: "alice",
            systemLanguage: "fr",
            deviceLocale: "fr"
        )
        XCTAssertEqual(user.preferredContentLanguages, ["fr"])
    }

    func test_preferredContentLanguages_dedupesDeviceLocale_matchingSystem_caseInsensitive() {
        let user = MeeshyUser(
            id: "u1", username: "alice",
            systemLanguage: "FR",
            deviceLocale: "fr-FR"
        )
        // System language wins, preserving its original casing.
        XCTAssertEqual(user.preferredContentLanguages, ["FR"])
    }

    // MARK: - Fallback

    func test_preferredContentLanguages_fallsBackToFr_whenAllNil() {
        let user = MeeshyUser(id: "u1", username: "alice")
        XCTAssertEqual(user.preferredContentLanguages, ["fr"])
    }

    // MARK: - Normalisation

    func test_preferredContentLanguages_normalizesDeviceLocale_underscoreForm() {
        // `Locale.current.identifier` on iOS returns `fr_FR` (underscore).
        let user = MeeshyUser(
            id: "u1", username: "alice",
            deviceLocale: "fr_FR"
        )
        XCTAssertEqual(user.preferredContentLanguages, ["fr"])
    }

    func test_preferredContentLanguages_normalizesDeviceLocale_dashedForm() {
        let user = MeeshyUser(
            id: "u1", username: "alice",
            deviceLocale: "fr-FR"
        )
        XCTAssertEqual(user.preferredContentLanguages, ["fr"])
    }

    func test_preferredContentLanguages_normalizesDeviceLocale_scriptAndRegion() {
        let user = MeeshyUser(
            id: "u1", username: "alice",
            deviceLocale: "zh-Hant-HK"
        )
        XCTAssertEqual(user.preferredContentLanguages, ["zh"])
    }

    func test_preferredContentLanguages_ignoresMalformedDeviceLocale() {
        let user = MeeshyUser(
            id: "u1", username: "alice",
            systemLanguage: "fr",
            deviceLocale: "@@@"
        )
        XCTAssertEqual(user.preferredContentLanguages, ["fr"])
    }

    // MARK: - normalizeLanguageCode helper

    func test_normalizeLanguageCode_plainCode() {
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("fr"), "fr")
    }

    func test_normalizeLanguageCode_dashedForm() {
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("en-US"), "en")
    }

    func test_normalizeLanguageCode_underscoreForm() {
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("fr_FR"), "fr")
    }

    func test_normalizeLanguageCode_scriptAndRegion() {
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("zh-Hant-HK"), "zh")
    }

    func test_normalizeLanguageCode_uppercaseIsLowered() {
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("FR-FR"), "fr")
    }

    func test_normalizeLanguageCode_invalidReturnsNil() {
        XCTAssertNil(MeeshyUser.normalizeLanguageCode(""))
        XCTAssertNil(MeeshyUser.normalizeLanguageCode(nil))
        XCTAssertNil(MeeshyUser.normalizeLanguageCode("@@@"))
        XCTAssertNil(MeeshyUser.normalizeLanguageCode("a"))
    }

    func test_normalizeLanguageCode_iso6393ReducesToSupportedPrefix() {
        // "eng" has no Meeshy entry but its 2-letter prefix "en" is supported.
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("eng"), "en")
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("fra"), "fr")
    }

    func test_normalizeLanguageCode_supportedThreeLetterCodePreserved() {
        // Cameroonian languages have no ISO 639-1 code and are keyed by their
        // 3-letter code everywhere. Truncating "bas" → "ba" (Bashkir) would
        // break the Prisme Linguistique resolution.
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("bas"), "bas")
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("dua"), "dua")
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("ewo"), "ewo")
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("bas-CM"), "bas")
    }

    func test_normalizeLanguageCode_unknownIso6393Rejected() {
        // "spa" → "sp" would be wrong (Spanish is "es"); refuse rather than corrupt.
        XCTAssertNil(MeeshyUser.normalizeLanguageCode("spa"))
        XCTAssertNil(MeeshyUser.normalizeLanguageCode("xyz"))
    }
}
