import Foundation
import MeeshySDK

/// La langue d'appel d'un participant (transcription, traduction) selon le
/// Prisme Linguistique. Sortie de `CallManager` : la règle ne lit que
/// l'utilisateur qu'on lui donne.
enum CallLanguagePreference {

    /// Resolves the preferred transcription/call language for a participant per
    /// Prisme Linguistique (full 5-level chain, mirroring `MeeshyUser.preferredContentLanguages`):
    ///   1. `systemLanguage`            — primary in-app preference
    ///   2. `regionalLanguage`          — secondary in-app preference
    ///   3. `customDestinationLanguage` — per-conversation override
    ///   4. `deviceLocale`              — OS-level locale (4th priority, normalised to ISO 639-1)
    ///   5. `"fr"`                      — ultimate fallback
    /// Pure + static — no side effects, no async, safe to unit test directly.
    static func preferredCallLanguage(for user: MeeshyUser?) -> String {
        user?.systemLanguage
            ?? user?.regionalLanguage
            ?? user?.customDestinationLanguage
            ?? MeeshyUser.normalizeLanguageCode(user?.deviceLocale)
            ?? "fr"
    }
}
