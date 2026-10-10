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

/// **La langue que le détail d'un post AFFICHE** (#9857) — la descente STRICTE du prisme du lecteur (`ReaderPrism`),
/// rangs 1 à 4 : la première langue servie gagne, par une traduction ou parce que le post est déjà écrit dedans ; sans
/// correspondance, l'original. Jamais l'ordre des clés d'un dictionnaire, qui change à chaque lancement.
nonisolated enum PostDisplayLanguage {
    static func code(originalLanguage: String?, translations: [String: PostTranslation]?, prism: [String]) -> String? {
        let servie = PrismTranslationResolver.resolve(
            originalLanguage: originalLanguage,
            translations: (translations ?? [:]).mapValues(\.text),
            preferredLanguages: prism
        )
        return (servie?.language ?? originalLanguage)?.lowercased()
    }
}
