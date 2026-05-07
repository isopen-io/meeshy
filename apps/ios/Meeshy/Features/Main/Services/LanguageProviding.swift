import Foundation
import MeeshySDK

/// Provides the user's resolved content language without coupling consumers
/// to `AuthManager.shared`. Allows tests to inject deterministic values
/// instead of fighting singleton state pollution.
///
/// The default production implementation `AuthManagerLanguageProvider` reads
/// `AuthManager.shared.currentUser?.preferredContentLanguages` exactly once
/// per call so updates to the authenticated user are picked up automatically.
///
/// Usage in ViewModels:
/// ```
/// init(languageProvider: LanguageProviding = AuthManagerLanguageProvider()) { ... }
///
/// var preferredLanguages: [String] { languageProvider.preferredLanguages }
/// var userLanguage: String { preferredLanguages.first ?? "en" }
/// ```
@MainActor
protocol LanguageProviding {
    var preferredLanguages: [String] { get }
}

/// Default implementation that defers to the live `AuthManager` singleton.
/// Reads `currentUser?.preferredContentLanguages` exactly once per call so
/// that updates to the authenticated user are picked up automatically.
@MainActor
struct AuthManagerLanguageProvider: LanguageProviding {
    var preferredLanguages: [String] {
        AuthManager.shared.currentUser?.preferredContentLanguages ?? []
    }
}
