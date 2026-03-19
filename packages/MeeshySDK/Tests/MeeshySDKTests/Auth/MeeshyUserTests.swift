import XCTest
@testable import MeeshySDK

final class MeeshyUserTests: XCTestCase {

    // MARK: - preferredContentLanguages

    func test_preferredContentLanguages_noLanguagesSet_returnsEmpty() {
        let user = MeeshyUser(
            id: "u1", username: "test"
        )

        XCTAssertEqual(user.preferredContentLanguages, [])
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

        XCTAssertEqual(user.preferredContentLanguages, ["de", "fr", "en"])
    }

    func test_preferredContentLanguages_customOnly_includesCustom() {
        let user = MeeshyUser(
            id: "u1", username: "test",
            systemLanguage: "fr",
            customDestinationLanguage: "de"
        )

        XCTAssertEqual(user.preferredContentLanguages, ["de", "fr"])
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
