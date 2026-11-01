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

    /// Lit un événement socket `error`. Un client sous le plancher de version (#13954), une fin de session
    /// d'invité ou un compte supprimé (#10482) arrêtent le transport — reconnexions comprises — et le
    /// signalent ; toute autre erreur n'est que journalisée, Socket.IO la retente.
    @discardableResult
    func handleSocketError(_ data: [Any], center: NotificationCenter = .default) -> GuestSessionEnd? {
        if let floor = UpgradeRequirement.belowFloor(socketError: data) { disconnect(); floor.post(via: center); return nil }
        guard let end = GuestSessionEnd.from(socketErrorPayload: data) else {
            if handleAccountDeletedError(data, center: center) == nil { Logger.socket.error("MessageSocket error: \(data)") }
            return nil
        }
        Logger.socket.warning("MessageSocket: guest session ended (\(end.rawValue, privacy: .public)) — reconnection stopped")
        disconnect()
        end.signal(center: center)
        return end
    }
}

extension UpgradeRequirement {
    /// Sous le plancher de version, la passerelle refuse le handshake : le
    /// transport s'arrête et la porte « Mettre à jour » se pose (#13954).
    static func belowFloor(socketError data: [Any]) -> UpgradeRequirement? {
        guard let requirement = fromSocketErrorPayload(data) else { return nil }
        Logger.socket.warning("MessageSocket: client below the version floor — reconnection stopped")
        return requirement
    }
}
