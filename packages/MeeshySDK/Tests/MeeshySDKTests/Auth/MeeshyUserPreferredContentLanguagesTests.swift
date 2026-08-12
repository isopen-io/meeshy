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
        // "eng"/"fra" have no Meeshy entry but map to a supported 639-1 code.
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("eng"), "en")
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("fra"), "fr")
    }

    func test_normalizeLanguageCode_reducesViaExplicitMapNotTruncation() {
        // "spa" (Spanish) reduces to the SUPPORTED "es" — NOT rejected, NOT
        // truncated to "sp". The explicit map knows the real 639-1 target.
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("spa"), "es")
        // 639-2/B (bibliographic) variants that differ from /T also reduce.
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("deu"), "de")
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("ger"), "de")
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("zho"), "zh")
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("chi"), "zh")
    }

    func test_normalizeLanguageCode_prefixCollisionMapsToCorrectLanguage() {
        // "swe" (Swedish) MUST map to "sv" — blind truncation gave "sw"
        // (Swahili), an unrelated supported language. This was the bug.
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("swe"), "sv")
        XCTAssertEqual(MeeshyUser.normalizeLanguageCode("swa"), "sw")
    }

    func test_normalizeLanguageCode_filipinoRejectedNotMappedToFinnish() {
        // Apple/CLDR report Filipino as "fil" (Locale.current = "fil_PH").
        // Blind truncation mapped it to "fi" (Finnish), silently serving a
        // Filipino user Finnish translations. Filipino has no supported Meeshy
        // entry, so the correct answer is nil.
        XCTAssertNil(MeeshyUser.normalizeLanguageCode("fil"))
        XCTAssertNil(MeeshyUser.normalizeLanguageCode("fil-PH"))
        XCTAssertNil(MeeshyUser.normalizeLanguageCode("tgl"))
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
        // A 3-letter code with no explicit 639-1 target is refused rather than
        // corrupted by truncation (both when its prefix is supported and not).
        XCTAssertNil(MeeshyUser.normalizeLanguageCode("xyz"))
        XCTAssertNil(MeeshyUser.normalizeLanguageCode("enx"))
    }
}
