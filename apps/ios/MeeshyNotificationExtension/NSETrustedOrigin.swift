import Foundation

/// **L'origine API de confiance des extensions de notification.**
///
/// Une extension ne fait jamais confiance à une URL venue de la charge push :
/// l'origine se résout depuis une petite ALLOWLIST calquée sur les
/// environnements (production, staging, localhost). L'app écrit l'environnement
/// actif dans les UserDefaults du groupe d'app (`meeshy_api_base_url`) quand on
/// en change depuis le menu de développement ; tout ce qui sort de l'allowlist
/// retombe sur la production.
///
/// Sortie de `NSEDataSync` (#8859) parce qu'elle a désormais DEUX lecteurs :
/// l'extension de service, qui télécharge les médias, et l'extension de
/// contenu, qui fait écouter la piste d'un vocal. Deux copies de l'allowlist
/// auraient divergé au premier environnement ajouté.
nonisolated enum NSETrustedOrigin {

    static let appGroupId = "group.me.meeshy.apps"

    private static let allowedApiBaseURLs: Set<String> = [
        "https://gate.meeshy.me",
        "https://gate.staging.meeshy.me",
        "http://localhost:3000"
    ]
    private static let defaultApiBaseURL = "https://gate.meeshy.me"
    private static let apiBaseURLDefaultsKey = "meeshy_api_base_url"

    static var apiBaseURL: String {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let stored = defaults.string(forKey: apiBaseURLDefaultsKey),
              allowedApiBaseURLs.contains(stored) else {
            return defaultApiBaseURL
        }
        return stored
    }
}
