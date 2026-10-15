import Foundation
import os

// Extrait de `MessageSocketManager.swift`, hors budget de taille (#10442) :
// l'événement `error` y est seulement branché, sa lecture vit ici.
//
// La passerelle émet `error { code: "SHARE_LINK_EXPIRED" }` puis coupe le
// socket d'un invité dont le lien a expiré (#10437). La boucle de reconnexion
// de Socket.IO (`reconnects(true)`, jusqu'à 16 s) rejouait alors la même
// authentification, refusée de la même façon, sans fin. Le transport s'arrête
// et le dit à l'app, qui oublie la session.

extension MessageSocketManager {

    /// Lit un événement socket `error`. Une fin de session d'invité arrête
    /// le transport — reconnexions comprises — et la signale ; toute autre
    /// erreur n'est que journalisée, Socket.IO la retente.
    @discardableResult
    func handleSocketError(_ data: [Any], center: NotificationCenter = .default) -> GuestSessionEnd? {
        guard let end = GuestSessionEnd.from(socketErrorPayload: data) else {
            // #10482 — un compte supprimé arrête aussi le transport.
            if handleAccountDeletedError(data, center: center) == nil { Logger.socket.error("MessageSocket error: \(data)") }
            return nil
        }
        Logger.socket.warning("MessageSocket: guest session ended (\(end.rawValue, privacy: .public)) — reconnection stopped")
        disconnect()
        end.signal(center: center)
        return end
    }
}
