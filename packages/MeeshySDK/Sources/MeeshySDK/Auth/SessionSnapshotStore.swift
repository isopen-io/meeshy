import Foundation
import os

private let logger = Logger(subsystem: "me.meeshy.sdk", category: "session-snapshot")

/// Session snapshot persisté en UserDefaults App Group pour permettre aux
/// extensions iOS (NSE, Widget, ShareExtension) de lire l'identité courante
/// sans accès à la `UserSession` SwiftUI (process séparé).
///
/// **V1 (P1 hotfix)** : seul `wipe()` est implémenté pour pin le contrat de
/// la première opération de `AuthManager.logout()` (cf. design doc D-7).
/// `write()` et `read()` viendront avec la Phase 6 de la migration UserSession
/// — quand le snapshot sera réellement écrit au login.
///
/// **Pourquoi wipe() aujourd'hui même si write() n'existe pas encore ?**
/// 1. Pin le call-site dans `AuthManager.logout()` : quand write() sera ajouté,
///    le wipe est déjà câblé au bon endroit (sécurité par construction).
/// 2. Purge les éventuelles clés `meeshy_session_*` que des extensions
///    auraient écrites prématurément dans le UserDefaults App Group.
///
/// **Convention V2-ready (D-15)** : la clé `keychainKey` porte un suffixe
/// versionné (`v1`) pour permettre la cohabitation V1 (un snapshot) et V2
/// (multi-account = N snapshots indexés par userId).
public enum SessionSnapshotStore {
    /// App Group identifier partagé par tous les processes Meeshy.
    /// MUST matcher l'entitlement `com.apple.security.application-groups`.
    public static let appGroupSuite = "group.me.meeshy.apps"

    /// Préfixe des clés snapshot dans le UserDefaults App Group.
    /// Versionné pour cohabitation V1/V2 (D-15).
    public static let keyPrefix = "meeshy_session_snapshot_v1"

    /// Supprime toutes les clés snapshot du UserDefaults App Group.
    /// **MUST être la première opération de `AuthManager.logout()`** (D-7) :
    /// si l'app crash entre wipe() et la fin du logout, le pire scénario
    /// est une session app principale qui apparaît authentifiée au
    /// redémarrage mais sans snapshot pour les extensions — détectable
    /// au boot et résolu via `checkExistingSession()`.
    ///
    /// Idempotent : peut être appelée plusieurs fois sans effet de bord.
    public static func wipe() {
        guard let defaults = UserDefaults(suiteName: appGroupSuite) else {
            logger.error("SessionSnapshot wipe: UserDefaults App Group \(appGroupSuite, privacy: .public) unavailable")
            return
        }
        let allKeys = defaults.dictionaryRepresentation().keys
        let snapshotKeys = allKeys.filter { $0.hasPrefix(keyPrefix) }
        for key in snapshotKeys {
            defaults.removeObject(forKey: key)
        }
        logger.info("SessionSnapshot wipe: removed \(snapshotKeys.count, privacy: .public) keys")
    }
}
