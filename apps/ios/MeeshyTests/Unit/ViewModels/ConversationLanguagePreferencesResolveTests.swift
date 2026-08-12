import XCTest
@testable import Meeshy

@MainActor
final class ConversationLanguagePreferencesResolveTests: XCTestCase {
    func test_resolved_frPrimaryEnRegional_ordersFrFirst() {
        let prefs = ConversationLanguagePreferences(
            userId: "u1", systemLanguage: "fr", regionalLanguage: "en",
            customDestinationLanguage: nil)
        XCTAssertEqual(prefs.resolved, ["fr", "en"])
    }

    func test_resolved_dedupesCaseInsensitive() {
        let prefs = ConversationLanguagePreferences(
            userId: "u1", systemLanguage: "FR", regionalLanguage: "fr",
            customDestinationLanguage: nil)
        XCTAssertEqual(prefs.resolved, ["FR"])
    }

    func test_resolved_includesSystemLanguageWhenSet() {
        let prefs = ConversationLanguagePreferences(
            userId: "u1", systemLanguage: "fr", regionalLanguage: nil,
            customDestinationLanguage: nil)
        XCTAssertTrue(prefs.resolved.contains("fr"))
    }
}
