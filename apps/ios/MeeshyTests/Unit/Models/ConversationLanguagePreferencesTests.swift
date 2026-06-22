import XCTest
@testable import Meeshy
import MeeshySDK

/// P4.2 step 1 — covers `ConversationLanguagePreferences.resolved`, the
/// strict Prisme Linguistique resolution extracted from
/// `ConversationViewModel`. Critical invariants:
///
/// 1. No `"fr"` fallback when the user has nothing configured (Prisme rule
///    says "no match → original", and the SDK's `MeeshyUser
///    .preferredContentLanguages` intentionally adds `"fr"` for a different
///    consumer).
/// 2. Order is `systemLanguage → regionalLanguage → customDestinationLanguage`.
/// 3. Duplicates are dropped case-insensitively (the gateway can return
///    `"FR"` and `"fr"` for the same code).
/// 4. The struct is `Equatable` so the ViewModel can keep an O(1) cache.
@MainActor
final class ConversationLanguagePreferencesTests: XCTestCase {

    // MARK: - Order

    func test_resolved_systemThenRegionalThenCustom() {
        let prefs = ConversationLanguagePreferences(
            userId: "u",
            systemLanguage: "fr",
            regionalLanguage: "en",
            customDestinationLanguage: "es"
        )
        XCTAssertEqual(prefs.resolved, ["fr", "en", "es"])
    }

    // MARK: - Dedup

    func test_resolved_caseInsensitiveDedup_keepsFirstOccurrence() {
        let prefs = ConversationLanguagePreferences(
            userId: "u",
            systemLanguage: "fr",
            regionalLanguage: "FR",
            customDestinationLanguage: "en"
        )
        XCTAssertEqual(prefs.resolved, ["fr", "en"])
    }

    func test_resolved_customDuplicatesSystem_isDropped() {
        let prefs = ConversationLanguagePreferences(
            userId: "u",
            systemLanguage: "es",
            regionalLanguage: nil,
            customDestinationLanguage: "es"
        )
        XCTAssertEqual(prefs.resolved, ["es"])
    }

    // MARK: - Nil / empty handling

    func test_resolved_allNil_returnsEmpty() {
        let prefs = ConversationLanguagePreferences(
            userId: "u",
            systemLanguage: nil,
            regionalLanguage: nil,
            customDestinationLanguage: nil
        )
        XCTAssertTrue(prefs.resolved.isEmpty,
                      "No 'fr' fallback — empty means 'show the original'")
    }

    func test_resolved_emptyStringFieldsAreIgnored() {
        let prefs = ConversationLanguagePreferences(
            userId: "u",
            systemLanguage: "",
            regionalLanguage: "en",
            customDestinationLanguage: ""
        )
        XCTAssertEqual(prefs.resolved, ["en"])
    }

    // MARK: - Equatable contract (the ViewModel cache key)

    func test_equality_sameUserAndSameLanguages_areEqual() {
        let a = ConversationLanguagePreferences(
            userId: "u-1",
            systemLanguage: "fr",
            regionalLanguage: "en",
            customDestinationLanguage: nil
        )
        let b = ConversationLanguagePreferences(
            userId: "u-1",
            systemLanguage: "fr",
            regionalLanguage: "en",
            customDestinationLanguage: nil
        )
        XCTAssertEqual(a, b)
    }

    func test_equality_userSwitch_breaksEquality() {
        let a = ConversationLanguagePreferences(
            userId: "u-1",
            systemLanguage: "fr",
            regionalLanguage: nil,
            customDestinationLanguage: nil
        )
        let b = ConversationLanguagePreferences(
            userId: "u-2",
            systemLanguage: "fr",
            regionalLanguage: nil,
            customDestinationLanguage: nil
        )
        XCTAssertNotEqual(a, b,
                          "User switch must invalidate the ViewModel cache")
    }

    func test_equality_languageEdit_breaksEquality() {
        let before = ConversationLanguagePreferences(
            userId: "u-1",
            systemLanguage: "fr",
            regionalLanguage: nil,
            customDestinationLanguage: nil
        )
        let after = ConversationLanguagePreferences(
            userId: "u-1",
            systemLanguage: "fr",
            regionalLanguage: "en",
            customDestinationLanguage: nil
        )
        XCTAssertNotEqual(before, after,
                          "A profile edit that adds a regional language must invalidate the cache")
    }

    // MARK: - MeeshyUser bridge

    func test_init_fromMeeshyUser_capturesAllFields() {
        let user = MeeshyUser(
            id: "u-9",
            username: "alice",
            systemLanguage: "fr",
            regionalLanguage: "en",
            customDestinationLanguage: "es"
        )
        let prefs = ConversationLanguagePreferences(user: user)
        XCTAssertEqual(prefs.userId, "u-9")
        // Without deviceLocale on the user nor injected, the device locale
        // falls back to the simulator's Locale.current.languageCode; we only
        // assert the first three slots so this test stays simulator-agnostic.
        XCTAssertEqual(Array(prefs.resolved.prefix(3)), ["fr", "en", "es"])
    }

    func test_init_fromNilUser_isEmpty_whenNoDeviceLocaleSurface() {
        // Both `user` and the explicit override are nil → no fallback to
        // Locale.current (we don't want the simulator locale to silently
        // leak into a "no preferences configured" scenario).
        let prefs = ConversationLanguagePreferences(
            user: nil,
            deviceLocaleOverride: ""
        )
        XCTAssertNil(prefs.userId)
        XCTAssertTrue(prefs.resolved.isEmpty)
    }

    // MARK: - Device locale (4th priority) — Phase 3 Task 9

    func test_resolved_includesDeviceLocale_inFourthPosition() {
        let prefs = ConversationLanguagePreferences(
            userId: "u",
            systemLanguage: "fr",
            regionalLanguage: "es",
            customDestinationLanguage: "pt",
            deviceLocaleOverride: "it"
        )
        XCTAssertEqual(prefs.resolved, ["fr", "es", "pt", "it"])
    }

    func test_resolved_dedupesDeviceLocale_matchingSystem() {
        let prefs = ConversationLanguagePreferences(
            userId: "u",
            systemLanguage: "fr",
            regionalLanguage: nil,
            customDestinationLanguage: nil,
            deviceLocaleOverride: "fr"
        )
        XCTAssertEqual(prefs.resolved, ["fr"])
    }

    func test_resolved_normalizesDashedDeviceLocale() {
        let prefs = ConversationLanguagePreferences(
            userId: "u",
            systemLanguage: nil,
            regionalLanguage: nil,
            customDestinationLanguage: nil,
            deviceLocaleOverride: "it-IT"
        )
        XCTAssertEqual(prefs.resolved, ["it"])
    }

    func test_resolved_normalizesUnderscoreDeviceLocale() {
        // `Locale.current.identifier` returns `fr_FR` on iOS — we must
        // normalise that to ISO 639-1 before comparing against translation
        // target codes.
        let prefs = ConversationLanguagePreferences(
            userId: "u",
            systemLanguage: nil,
            regionalLanguage: nil,
            customDestinationLanguage: nil,
            deviceLocaleOverride: "fr_FR"
        )
        XCTAssertEqual(prefs.resolved, ["fr"])
    }

    func test_resolved_skipsDeviceLocale_whenMalformed() {
        let prefs = ConversationLanguagePreferences(
            userId: "u",
            systemLanguage: "fr",
            regionalLanguage: nil,
            customDestinationLanguage: nil,
            deviceLocaleOverride: "@@@"
        )
        XCTAssertEqual(prefs.resolved, ["fr"])
    }

    func test_resolved_skipsDeviceLocale_whenExplicitlyEmpty() {
        // An empty override means "do not fall back to Locale.current either".
        let prefs = ConversationLanguagePreferences(
            userId: "u",
            systemLanguage: "fr",
            regionalLanguage: nil,
            customDestinationLanguage: nil,
            deviceLocaleOverride: ""
        )
        XCTAssertEqual(prefs.resolved, ["fr"])
    }

    func test_init_fromMeeshyUser_picksUpDeviceLocaleField() {
        let user = MeeshyUser(
            id: "u-9",
            username: "alice",
            systemLanguage: "fr",
            deviceLocale: "it"
        )
        let prefs = ConversationLanguagePreferences(user: user)
        XCTAssertEqual(prefs.resolved, ["fr", "it"])
    }

    func test_normalize_isMirrorOf_MeeshyUserHelper() {
        // Symmetry contract: both helpers MUST produce identical output for
        // the same input. The spec lists three mirror sites (TS shared, SDK
        // MeeshyUser, app ConversationLanguagePreferences) — this asserts
        // the two Swift sites match.
        for input in ["fr", "fr_FR", "fr-FR", "zh-Hant-HK", "FR", "ENG", "@@@", "", "a"] {
            XCTAssertEqual(
                ConversationLanguagePreferences.normalize(input),
                MeeshyUser.normalizeLanguageCode(input),
                "Mirror divergence on input '\(input)'"
            )
        }
    }
}
