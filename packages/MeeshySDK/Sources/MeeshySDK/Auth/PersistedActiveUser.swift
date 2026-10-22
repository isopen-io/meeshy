import Foundation
import os

/// **Le compte actif de l'appareil, lu UNE fois au trousseau puis tenu en mémoire** (#11558).
///
/// Chaque lecture du trousseau est un aller-retour XPC SYNCHRONE vers `securityd`.
/// `AuthManager.activeUserId` le relisait à CHAQUE accès — clé du cache, jeton,
/// jeton de session, expiration : cinq lectures sur le fil principal pour reprendre
/// une session au démarrage à froid, avant le premier rendu de la liste — et son
/// setter réécrivait la valeur que le trousseau portait déjà.
///
/// La mémoire ne peut pas dériver : `AuthManager` est le seul écrivain de cette clé
/// dans le processus, et l'écriture traverse jusqu'au trousseau. Un écrivain qui le
/// contourne (la migration des clés historiques, la vitrine) fait `forget()`. Les
/// extensions ne lisent que le groupe d'app, qui reçoit chaque écriture.
struct PersistedActiveUser: Sendable {
    static let key = "meeshy_active_user_id"

    /// `.none` : jamais lu. `.some(nil)` : lu, et absent.
    private var known: String?? = .none

    mutating func read(from keychain: any KeychainStoring) -> String? {
        if case .some(let value) = known { return value }
        let value = keychain.load(forKey: Self.key, account: nil)
        known = .some(value)
        return value
    }

    /// Le groupe d'app reçoit la valeur à chaque écriture : c'est ce qui le répare
    /// quand il a été vidé sans que le trousseau le soit. Il s'écrit sur la file
    /// `AppGroupIO`, dans l'ordre des écritures : seules les extensions le lisent.
    mutating func write(_ value: String?, to keychain: any KeychainStoring, groupSuite: String?, io: AppGroupIO = .shared) {
        if let groupSuite {
            let key = Self.key
            io.enqueue { UserDefaults(suiteName: groupSuite)?.set(value, forKey: key) }
        }
        if case .some(let held) = known, held == value { return }
        guard let value else {
            keychain.delete(forKey: Self.key, account: nil)
            known = .some(nil)
            return
        }
        do {
            try keychain.save(value, forKey: Self.key, account: nil)
            known = .some(value)
        } catch {
            known = .none
            Logger.auth.error("Failed to save activeUserId to keychain: \(error.localizedDescription, privacy: .public)")
        }
    }

    mutating func forget() { known = .none }
}
