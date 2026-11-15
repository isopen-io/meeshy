import Foundation
import MeeshySDK

/// **Les protections armées sont COLLANTES** (#8305) — elles restent armées
/// pour les messages suivants de la conversation jusqu'à ce qu'on les change,
/// et survivent à la sortie et à la relance.
extension ConversationViewModel {

    /// Relit ce que la conversation avait armé — appelé une fois, à la création.
    func restoreArmedProtection() {
        let preference = protectionPreferences.preference(for: conversationId)
        ephemeralChoice = preference.ephemeralChoice
        isBlurEnabled = preference.isBlurred
        isViewOnceEnabled = preference.isViewOnce
    }

    /// Écrit ce qui est armé — à chaque bascule d'une protection.
    func persistArmedProtection() {
        protectionPreferences.save(
            ConversationProtectionPreference(ephemeralChoice: ephemeralChoice,
                                             isBlurred: isBlurEnabled,
                                             isViewOnce: isViewOnceEnabled),
            for: conversationId
        )
    }
}
