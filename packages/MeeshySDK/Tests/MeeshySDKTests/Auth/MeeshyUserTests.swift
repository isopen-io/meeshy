import XCTest
@testable import MeeshySDK

final class MeeshyUserTests: XCTestCase {

    // MARK: - preferredContentLanguages

    func test_preferredContentLanguages_allFlagsFalse_returnsSystemLanguage() {
        let user = MeeshyUser(
            id: "u1", username: "test",
            systemLanguage: "fr", regionalLanguage: "en",
            translateToSystemLanguage: false,
            translateToRegionalLanguage: false,
            useCustomDestination: false
        )

        XCTAssertEqual(user.preferredContentLanguages, ["fr"])
    }

    func test_preferredContentLanguages_allFlagsNil_returnsSystemLanguage() {
        let user = MeeshyUser(
            id: "u1", username: "test",
            systemLanguage: "fr", regionalLanguage: "en"
        )

        XCTAssertEqual(user.preferredContentLanguages, ["fr"])
    }

    func test_preferredContentLanguages_allFlagsFalseNoSystemLanguage_returnsEmpty() {
        let user = MeeshyUser(
            id: "u1", username: "test",
            translateToSystemLanguage: false,
            translateToRegionalLanguage: false,
            useCustomDestination: false
        )

        XCTAssertEqual(user.preferredContentLanguages, [])
    }

    func test_preferredContentLanguages_systemFlagTrue_includesSystemLanguage() {
        let user = MeeshyUser(
            id: "u1", username: "test",
            systemLanguage: "fr", regionalLanguage: "en",
            translateToSystemLanguage: true,
            translateToRegionalLanguage: false,
            useCustomDestination: false
        )

        XCTAssertEqual(user.preferredContentLanguages, ["fr"])
    }

    func test_preferredContentLanguages_bothFlagsTrue_includesBoth() {
        let user = MeeshyUser(
            id: "u1", username: "test",
            systemLanguage: "fr", regionalLanguage: "en",
            translateToSystemLanguage: true,
            translateToRegionalLanguage: true,
            useCustomDestination: false
        )

        XCTAssertEqual(user.preferredContentLanguages, ["fr", "en"])
    }

    func test_preferredContentLanguages_customOverride_includesCustomFirst() {
        let user = MeeshyUser(
            id: "u1", username: "test",
            systemLanguage: "fr", regionalLanguage: "en",
            customDestinationLanguage: "de",
            translateToSystemLanguage: true,
            translateToRegionalLanguage: true,
            useCustomDestination: true
        )

        XCTAssertEqual(user.preferredContentLanguages, ["de", "fr", "en"])
    }

    func test_preferredContentLanguages_onlyCustomFlagTrue_includesCustomThenFallback() {
        let user = MeeshyUser(
            id: "u1", username: "test",
            systemLanguage: "fr",
            customDestinationLanguage: "de",
            translateToSystemLanguage: false,
            translateToRegionalLanguage: false,
            useCustomDestination: true
        )

        // Custom is added via its flag, no fallback needed since preferred is not empty
        XCTAssertEqual(user.preferredContentLanguages, ["de"])
    }
}
