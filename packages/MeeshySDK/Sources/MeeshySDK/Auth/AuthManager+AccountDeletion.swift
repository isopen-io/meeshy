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
    @discardableResult
    public func retireDeletedAccount(userId: String) async -> Bool {
        guard AccountDeletedSignal.isAccountId(userId) else { return false }
        guard await awaitAccountSwitchEnd() else { return false }
        let wasActive = Self.retirementLeavesTheOpenSession(retiredUserId: userId, activeUserId: activeUserId)
        if wasActive {
            Logger.auth.warning("Active account deleted server-side — leaving its session")
            await leaveActiveSession(endingIt: false)
        }
        removeSavedAccount(userId: userId)
        // En DERNIER, comme `logout` : déclenche le router et les crochets de sortie.
        if wasActive { isAuthenticated = false }
        return true
    }
}
