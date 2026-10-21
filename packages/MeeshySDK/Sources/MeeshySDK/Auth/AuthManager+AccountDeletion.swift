import Foundation
import os

// MARK: - Un compte supprimé quitte l'appareil (#10482)
//
// La passerelle a dit, pour le compte qu'elle NOMME, « supprimé » (purge
// confirmée, irréversible — `AccountDeletedSignal`). Ce compte quitte le
// sélecteur avec ses jetons du trousseau et son cache ; s'il est ouvert, sa
// session se démonte d'abord. Aucun autre compte n'est touché : pendant une
// bascule, on attend qu'elle rende la main, puis seul le compte nommé part.

extension AuthManager {

    /// La loi : le retrait démonte la session ouverte SEULEMENT si elle est
    /// celle du compte retiré — jamais celle d'un autre compte.
    nonisolated static func retirementLeavesTheOpenSession(retiredUserId: String, activeUserId: String?) -> Bool {
        retiredUserId == activeUserId
    }

    /// Retire `userId` de l'appareil. `false` si rien n'a pu être décidé
    /// (identifiant malformé, attente de bascule annulée) : l'appelant garde
    /// alors le retrait pour plus tard.
    ///
    /// Le compte ACTIF part sous le verrou de bascule (`isSwitchingAccount`),
    /// pris sans suspension après la fin de toute bascule : connexion,
    /// reprise et preuve par e-mail sont refusées pendant ce temps, et un
    /// `switchAccount` attend la fin du retrait. Aucune session posée
    /// ailleurs ne peut donc être démontée par lui.
    @discardableResult
    public func retireDeletedAccount(userId: String) async -> Bool {
        guard AccountDeletedSignal.isAccountId(userId) else { return false }
        while isSwitchingAccount {
            do { try await Task.sleep(for: .milliseconds(20)) } catch { return false }
        }
        defer { AccountDeletedSignal.retirementDone(userId) }
        guard Self.retirementLeavesTheOpenSession(retiredUserId: userId, activeUserId: activeUserId) else {
            removeSavedAccount(userId: userId)
            return true
        }
        isSwitchingAccount = true
        isRetiringActiveAccount = true
        defer {
            isRetiringActiveAccount = false
            isSwitchingAccount = false
        }
        Logger.auth.warning("Active account deleted server-side — leaving its session")
        await leaveActiveSession(endingIt: false)
        let generation = sessionGeneration
        removeSavedAccount(userId: userId)
        // En DERNIER, comme `logout` : déclenche le router et les crochets de
        // sortie — seulement si aucune autre session ne s'est posée.
        if activeUserId == nil, sessionGeneration == generation { isAuthenticated = false }
        return true
    }

    /// Attend la fin du retrait du compte actif. `false` si la tâche appelante
    /// est annulée pendant l'attente.
    func awaitActiveAccountRetirementEnd() async -> Bool {
        while isRetiringActiveAccount {
            do { try await Task.sleep(for: .milliseconds(20)) } catch { return false }
        }
        return true
    }

    /// Quand la session en cours de `userId` a été posée (connexion, reprise
    /// par rafraîchissement) ; `nil` sans session au trousseau.
    public func sessionIssuedAt(for userId: String) -> Date? {
        guard let raw = keychain.load(forKey: tokenDateUDKey(for: userId), account: nil),
              let seconds = TimeInterval(raw) else { return nil }
        return Date(timeIntervalSince1970: seconds)
    }
}
