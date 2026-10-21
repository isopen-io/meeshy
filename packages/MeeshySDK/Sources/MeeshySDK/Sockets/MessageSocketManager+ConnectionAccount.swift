import Foundation
import os
import SocketIO

// Le compte AU NOM DUQUEL le socket parle — celui du JWT de son handshake —
// et ce que la passerelle dit de lui (#10482). Extrait de
// `MessageSocketManager.swift`, hors budget de taille.

extension MessageSocketManager {

    /// Les en-têtes du handshake — le JWT, et le jeton de session s'il existe.
    ///
    /// Extrait pour être testable : la construction du `SocketManager` ne l'est
    /// pas, et c'est la PRÉSENCE de la seconde clé qui décide si la révocation
    /// d'une session peut atteindre cet appareil.
    /// Le jeton est passé en PARAMÈTRE, jamais lu depuis le singleton ici :
    /// `AuthManager` est isolé `@MainActor`, et cette fonction est appelée
    /// depuis le contexte de transport. La lire ici forcerait un saut d'acteur
    /// dans une construction synchrone — et rendrait la fonction intestable.
    static func handshakeHeaders(token: String, sessionToken: String?) -> [String: String] {
        var headers = ["Authorization": "Bearer \(token)"]
        if let sessionToken, !sessionToken.isEmpty {
            headers["x-session-token"] = sessionToken
        }
        return headers
    }

    /// Le compte du JWT présenté au handshake du transport courant ; `nil`
    /// pour un invité (jeton de session seul) ou sans transport.
    var connectionAccountId: String? {
        guard let manager = socket?.manager as? SocketManager else { return nil }
        for case let .extraHeaders(headers) in manager.config {
            return AccountDeletedSignal.owner(ofJWT: headers["Authorization"])
        }
        return nil
    }

    /// `error { code: "ACCOUNT_DELETED", accountId }` : le compte de CETTE
    /// connexion est supprimé. Le transport s'arrête — reconnexions
    /// comprises, elles seraient refusées de la même façon — et le retrait
    /// est signalé. Un compte nommé qui n'est pas celui de la connexion ne
    /// retire rien.
    @discardableResult
    func handleAccountDeletedError(_ data: [Any], center: NotificationCenter = .default) -> String? {
        guard let accountId = AccountDeletedSignal.owned(
            AccountDeletedSignal.namedAccount(socketErrorPayload: data), by: connectionAccountId
        ) else { return nil }
        Logger.socket.warning("MessageSocket: account deleted — reconnection stopped")
        disconnect()
        AccountDeletedSignal.signal(accountId: accountId, center: center)
        return accountId
    }

    /// `auth:session-revoked { deletedAccountId }` — la purge confirmée du
    /// compte de CETTE connexion. La fermeture de session suit son chemin
    /// habituel ; seul le retrait du compte s'y ajoute.
    @discardableResult
    func signalAccountDeleted(sessionRevokedPayload data: [Any], center: NotificationCenter = .default) -> String? {
        guard let accountId = AccountDeletedSignal.owned(
            AccountDeletedSignal.namedAccount(sessionRevokedPayload: data), by: connectionAccountId
        ) else { return nil }
        AccountDeletedSignal.signal(accountId: accountId, center: center)
        return accountId
    }
}
