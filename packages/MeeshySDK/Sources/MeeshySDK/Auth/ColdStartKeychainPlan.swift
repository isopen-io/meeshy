import Foundation

/// **Ce que le premier écran lit au trousseau** (#11587), lu d'avance par
/// `KeychainManager.prefetchColdStartSession()` dès le lancement du processus.
///
/// Premier passage : la clé de la base GRDB (`DatabaseEncryption`), le compte
/// actif (QUELLE base ouvrir) et la liste des comptes (le sélecteur). Second
/// passage, selon la réponse : la session du compte actif, ou, sans compte
/// actif, les clés globales historiques que la migration va chercher. Un
/// trousseau verrouillé ne déclenche rien de plus : la lecture directe tranchera.
enum ColdStartKeychainPlan {
    static var plan: KeychainPrefetchPlan {
        KeychainPrefetchPlan(
            keys: [DatabaseEncryption.keychainKey, PersistedActiveUser.key, AuthStorageKeys.savedAccounts],
            followUp: followUp
        )
    }

    @Sendable private static func followUp(_ found: [String: KeychainRead]) -> [String] {
        switch found[PersistedActiveUser.key] {
        case .value(let userId):
            return [
                AuthStorageKeys.token(for: userId),
                AuthStorageKeys.sessionToken(for: userId),
                AuthStorageKeys.user(for: userId),
                AuthStorageKeys.pendingProfile(for: userId),
            ]
        case .absent:
            return [AuthStorageKeys.legacyToken, AuthStorageKeys.legacyUser]
        case .unavailable, nil:
            return []
        }
    }
}
