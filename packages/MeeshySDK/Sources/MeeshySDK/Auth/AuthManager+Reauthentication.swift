import Combine
import Foundation
import os

// MARK: - Le serveur a refusé la session (#10463)
//
// Un refus d'authentification ne démonte QUE le compte qui l'a reçu, sous la
// session qui l'a demandé. Le refus d'une requête lancée sous un compte qu'on
// est en train de quitter (changement de compte, déconnexion), ou sous une
// session déjà remplacée, ne dit rien de la session ouverte — et ne doit pas
// effacer les jetons d'un compte gardé au sélecteur.

extension AuthManager {

    /// La loi : un refus s'applique s'il vise le compte ACTIF, sous la
    /// génération COURANTE, hors de toute sortie de session.
    nonisolated static func reauthenticationApplies(
        refusedUserId: String,
        refusedGeneration: UInt64,
        activeUserId: String?,
        currentGeneration: UInt64,
        isLeavingActiveSession: Bool
    ) -> Bool {
        guard !isLeavingActiveSession else { return false }
        guard refusedGeneration == currentGeneration else { return false }
        return refusedUserId == activeUserId
    }

    /// Soft re-auth signal: the server told us the session is genuinely
    /// invalid (revoked, expired beyond the sliding window, account
    /// disabled). We clear the active token + sessionToken so the API
    /// client stops sending dead credentials and flip `isAuthenticated`
    /// to false so the UI can prompt for re-login. The saved account is
    /// preserved — the user just needs to enter their password again.
    ///
    /// `generation` est celle de la session sous laquelle la requête refusée
    /// est partie (`sessionGeneration` lue AVANT l'appel).
    func requireReauthentication(userId: String, generation: UInt64) {
        // #10482 — un compte que la passerelle a dit supprimé n'est pas une
        // session à rouvrir : son retrait la démonte, sans inviter à se reconnecter.
        guard !AccountDeletedSignal.isAwaitingRetirement(userId) else { return }
        guard Self.reauthenticationApplies(
            refusedUserId: userId,
            refusedGeneration: generation,
            activeUserId: activeUserId,
            currentGeneration: sessionGeneration,
            isLeavingActiveSession: isLeavingActiveSession
        ) else {
            Logger.auth.info("Authentication refusal ignored: it belongs to a session that is being left or was replaced")
            return
        }
        // startup-03 — signal AVANT tout flip pour que le hook outbox
        // (DependencyContainer) distingue une session invalidée par le
        // serveur d'un logout volontaire (qui n'émet jamais ce signal).
        sessionInvalidated.send(())
        keychain.delete(forKey: tokenKey(for: userId), account: nil)
        keychain.delete(forKey: sessionTokenKey(for: userId), account: nil)
        keychain.delete(forKey: tokenDateUDKey(for: userId), account: nil)
        // #8674 — session révoquée : le cache du compte part, rien n'en est
        // mis de côté (ses jetons viennent d'être effacés).
        CacheAccountBinder.shared.bind(nil)
        activeUserId = nil
        currentUser = nil
        // sync-04 — ce chemin ne passe PAS par logout() mais son flip
        // isAuthenticated purge quand même les caches (container + app) :
        // sans ce reset, la ré-auth du MÊME compte hérite d'un checkpoint
        // pointant après des données purgées = delta partiel servi comme frais.
        ConversationSyncEngine.shared.resetSyncCheckpoints()
        isAuthenticated = false
        APIClient.shared.authToken = nil
        APIClient.shared.registeredSessionToken = nil
    }
}
