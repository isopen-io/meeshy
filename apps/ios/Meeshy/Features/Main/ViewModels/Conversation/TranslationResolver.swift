import Foundation
import MeeshySDK
import MeeshyUI

/// Logic for resolving which translation to show based on user preferences.
@MainActor
final class TranslationResolver {
    private let state: ConversationStateStore
    private let authManager: AuthManaging
    private var _cachedLanguagePreferences: ConversationLanguagePreferences?

    init(state: ConversationStateStore, authManager: AuthManaging = AuthManager.shared) {
        self.state = state
        self.authManager = authManager
    }

    private var preferredLanguages: [String] {
        let prefs = ConversationLanguagePreferences(user: authManager.currentUser)
        if _cachedLanguagePreferences == prefs, let cached = _cachedLanguagePreferences {
            return cached.resolved
        }
        _cachedLanguagePreferences = prefs
        return prefs.resolved
    }

    func preferredTranslation(for message: Message) -> MessageTranslation? {
        if let override = state.activeTranslationOverrides[message.id] {
            return override
        }
        guard let translations = state.messageTranslations[message.id], !translations.isEmpty else { return nil }

        let originalLang = message.originalLanguage.lowercased()
        let langs = preferredLanguages
        
        for lang in langs {
            let langLower = lang.lowercased()
            if originalLang == langLower { return nil }
            if let match = translations.first(where: { $0.targetLanguage.lowercased() == langLower }) {
                return match
            }
        }
        return nil
    }
    
    func invalidatePreferenceCache() {
        _cachedLanguagePreferences = nil
    }
}
