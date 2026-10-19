import Foundation
import os

/// Les clés de stockage NAMESPACÉES par compte (trousseau et défauts).
/// `AuthManager.tokenKey(for:)` & co. y délèguent : un seul endroit les écrit.
enum AuthStorageKeys {
    static func token(for userId: String) -> String { "meeshy_token_\(userId)" }
    static func user(for userId: String) -> String { "meeshy_user_\(userId)" }
    static func sessionToken(for userId: String) -> String { "meeshy_session_token_\(userId)" }
    static func tokenDate(for userId: String) -> String { "meeshy_token_date_\(userId)" }
    static func pendingProfile(for userId: String) -> String { "meeshy_pending_profile_\(userId)" }
}

/// Persistance trousseau du profil d'un compte : l'utilisateur courant et la
/// garde du profil optimiste en attente. Construite à l'usage depuis le
/// trousseau COURANT de `AuthManager` (un `var` que les tests substituent).
struct AuthProfileKeychainStore {
    let keychain: any KeychainStoring

    func saveUser(_ user: MeeshyUser, userId: String) {
        let sanitized = user.droppingDataURIImages()
        do {
            let encoded = try JSONEncoder().encode(sanitized)
            guard let jsonString = String(data: encoded, encoding: .utf8) else {
                Logger.auth.error("Failed to convert sanitized user data to UTF8 string for userId \(userId, privacy: .public)")
                return
            }
            try keychain.save(jsonString, forKey: AuthStorageKeys.user(for: userId), account: nil)
        } catch {
            Logger.auth.error("Failed to save user to keychain for userId \(userId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    /// U3-cont'd — `pendingOptimisticProfile` guards a revalidation/refresh
    /// response from clobbering an in-flight optimistic edit, but was
    /// in-memory only: a kill+relaunch while the `updateProfile` outbox row
    /// was still unconfirmed dropped the guard, so the next cold start's
    /// `/auth/me` revalidation clobbered the correctly keychain-hydrated
    /// optimistic profile with the stale pre-edit server value (no version/
    /// timestamp compare recovers from that). Persisting the guard itself —
    /// not just the optimistic user — closes that window: `checkExistingSession`
    /// reloads it before the revalidation Task can run.
    func savePendingProfile(_ snapshot: ProfileSnapshot, userId: String) {
        do {
            let encoded = try JSONEncoder().encode(snapshot)
            guard let jsonString = String(data: encoded, encoding: .utf8) else {
                Logger.auth.error("Failed to convert pending profile guard to UTF8 string for userId \(userId, privacy: .public)")
                return
            }
            try keychain.save(jsonString, forKey: AuthStorageKeys.pendingProfile(for: userId), account: nil)
        } catch {
            Logger.auth.error("Failed to persist pending profile guard for userId \(userId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    func loadPendingProfile(userId: String) -> ProfileSnapshot? {
        guard let jsonString = keychain.load(forKey: AuthStorageKeys.pendingProfile(for: userId), account: nil),
              let data = jsonString.data(using: .utf8) else { return nil }
        do {
            return try JSONDecoder().decode(ProfileSnapshot.self, from: data)
        } catch {
            // Snapshot écrit par une version antérieure de `ProfileSnapshot` :
            // traité comme « aucun profil en attente ».
            Logger.auth.error("Failed to decode pending profile guard for userId \(userId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    func clearPendingProfile(userId: String) {
        keychain.delete(forKey: AuthStorageKeys.pendingProfile(for: userId), account: nil)
    }
}
