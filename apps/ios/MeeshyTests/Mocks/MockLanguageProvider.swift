import Foundation
@testable import Meeshy

/// Test double for `LanguageProviding`. Defaults to an empty preferred-language
/// list so `userLanguage` falls back to `"en"`, isolating each test from
/// `AuthManager.shared` state pollution leaked by other suites.
///
/// Used by `FeedViewModelTests`, `PostDetailViewModelTests`,
/// `BookmarksViewModelTests` so they don't depend on the live `AuthManager`
/// singleton — which can carry over `currentUser` between tests when other
/// suites in the same process don't clean up.
@MainActor
final class MockLanguageProvider: LanguageProviding {
    var preferredLanguages: [String]

    init(preferredLanguages: [String] = []) {
        self.preferredLanguages = preferredLanguages
    }
}
