import Foundation
import SocketIO

// #8063 — le partage d'écran d'appel. Dans son propre fichier parce que
// `MessageSocketManager.swift` est hors budget de taille (directive
// 2026-09-02 : on n'ajoute pas à un fichier qui dépasse).
//
// La passerelle diffuse ce geste aux AUTRES participants sous la forme
// existante `call:media-toggled` avec `mediaType: "screen"`, que
// `CallMediaToggleData.mediaType` (une chaîne) décode déjà : aucun nouvel
// abonnement n'est nécessaire côté réception.

extension MessageSocketManager {
    public func emitCallToggleScreen(callId: String, enabled: Bool) {
        socket?.emit("call:toggle-screen", ["callId": callId, "enabled": enabled])
    }
}
