import XCTest
@testable import MeeshySDK

final class MeeshyUserTests: XCTestCase {

    // MARK: - preferredContentLanguages

    func test_preferredContentLanguages_noLanguagesSet_returnsFrenchFallback() {
        let user = MeeshyUser(
            id: "u1", username: "test"
        )

        // Prisme: when no language is configured, fallback is "fr" (per resolveUserLanguage in shared)
        XCTAssertEqual(user.preferredContentLanguages, ["fr"])
    }

    func test_preferredContentLanguages_onlySystemLanguage_returnsSystemLanguage() {
        let user = MeeshyUser(
            id: "u1", username: "test",
            systemLanguage: "fr"
        )

        XCTAssertEqual(user.preferredContentLanguages, ["fr"])
    }

    func test_preferredContentLanguages_systemAndRegional_includesBoth() {
        let user = MeeshyUser(
            id: "u1", username: "test",
            systemLanguage: "fr", regionalLanguage: "en"
        )

        XCTAssertEqual(user.preferredContentLanguages, ["fr", "en"])
    }

    func test_preferredContentLanguages_allLanguagesSet_includesAll() {
        let user = MeeshyUser(
            id: "u1", username: "test",
            systemLanguage: "fr", regionalLanguage: "en",
            customDestinationLanguage: "de"
        )

        // Order per resolveUserLanguage(): system → regional → custom
        XCTAssertEqual(user.preferredContentLanguages, ["fr", "en", "de"])
    }

    func test_preferredContentLanguages_customOnly_includesCustom() {
        let user = MeeshyUser(
            id: "u1", username: "test",
            systemLanguage: "fr",
            customDestinationLanguage: "de"
        )

        // Order per resolveUserLanguage(): system → custom
        XCTAssertEqual(user.preferredContentLanguages, ["fr", "de"])
    }

    func test_preferredContentLanguages_duplicateLanguages_deduplicates() {
        let user = MeeshyUser(
            id: "u1", username: "test",
            systemLanguage: "fr", regionalLanguage: "fr",
            customDestinationLanguage: "fr"
        )

        XCTAssertEqual(user.preferredContentLanguages, ["fr"])
    }

    func test_preferredContentLanguages_caseInsensitiveDedup() {
        let user = MeeshyUser(
            id: "u1", username: "test",
            systemLanguage: "FR", regionalLanguage: "fr"
        )

        XCTAssertEqual(user.preferredContentLanguages, ["FR"])
    }
}
