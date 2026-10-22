import Foundation
import os

/// Migration unique des clés GLOBALES historiques (UserDefaults et trousseau
/// sans namespace) vers les clés par compte. Rejouée à chaque
/// `checkExistingSession`, elle est sans effet une fois les clés migrées.
///
/// `run()` rend `true` quand elle a posé le compte actif au trousseau elle-même :
/// `AuthManager` doit alors oublier celui qu'il tient en mémoire (#11558).
@MainActor
struct LegacyAuthKeyMigration {
    let keychain: any KeychainStoring
    let userDefaults: UserDefaults
    let activeUserIdKey: String
    let savedAccountsKey: String
    let legacyTokenKey: String
    let legacyUserKey: String
    /// Le compte actif TEL QU'IL EST à l'instant de l'appel (relu après les
    /// étapes 1 et 2, qui peuvent l'avoir posé dans le trousseau).
    let currentActiveUserId: () -> String?
    /// Pose le compte migré comme actif et l'inscrit au sélecteur.
    let adopt: (MeeshyUser) -> Void

    @discardableResult
    func run() -> Bool {
        var wroteActiveUser = false
        // 1. Migrate activeUserId from UserDefaults to Keychain
        if let legacyActiveId = userDefaults.string(forKey: activeUserIdKey) {
            if keychain.load(forKey: activeUserIdKey, account: nil) == nil {
                do {
                    try keychain.save(legacyActiveId, forKey: activeUserIdKey, account: nil)
                    wroteActiveUser = true
                } catch {
                    Logger.auth.error("Legacy migration failed for activeUserId: \(error.localizedDescription, privacy: .public)")
                }
            }
            userDefaults.removeObject(forKey: activeUserIdKey)
        }

        // 2. Migrate savedAccounts from UserDefaults to Keychain
        if let legacyData = userDefaults.data(forKey: savedAccountsKey),
           let legacyJson = String(data: legacyData, encoding: .utf8) {
            if keychain.load(forKey: savedAccountsKey, account: nil) == nil {
                do {
                    try keychain.save(legacyJson, forKey: savedAccountsKey, account: nil)
                } catch {
                    Logger.auth.error("Legacy migration failed for savedAccounts: \(error.localizedDescription, privacy: .public)")
                }
            }
            userDefaults.removeObject(forKey: savedAccountsKey)
        }

        // 3. First migrate any UserDefaults → Keychain entries
        // (Uses the default keychain implementation's migration helper if available)
        if let manager = keychain as? KeychainManager {
            manager.migrateFromUserDefaults(keys: [legacyTokenKey, legacyUserKey])
        }

        // 4. Only migrate if no active user is set yet
        guard currentActiveUserId() == nil,
              let token = keychain.load(forKey: legacyTokenKey, account: nil),
              let userJSON = keychain.load(forKey: legacyUserKey, account: nil),
              let userData = userJSON.data(using: .utf8) else {
            return wroteActiveUser
        }

        do {
            let user = try JSONDecoder().decode(MeeshyUser.self, from: userData)
            let userId = user.id
            try keychain.save(token, forKey: AuthStorageKeys.token(for: userId), account: nil)
            try keychain.save(userJSON, forKey: AuthStorageKeys.user(for: userId), account: nil)
            // Use now as tokenSavedAt (we don't know the original date — within 1 year is safe)
            let now = String(Date().timeIntervalSince1970)
            try keychain.save(now, forKey: AuthStorageKeys.tokenDate(for: userId), account: nil)
            adopt(user)
        } catch {
            Logger.auth.error("Legacy user migration failed: \(error.localizedDescription, privacy: .public)")
        }

        keychain.delete(forKey: legacyTokenKey, account: nil)
        keychain.delete(forKey: legacyUserKey, account: nil)
        return wroteActiveUser
    }
}
