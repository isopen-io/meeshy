import Foundation
import SocketIO

/// La configuration du transport Socket.IO des gestionnaires de socket, en UN
/// seul endroit.
///
/// Elle est sortie de `MessageSocketManager` au lot #16750, et pas pour gagner
/// des lignes : le gestionnaire en portait DEUX copies — celle d'un inscrit et
/// celle d'un invité de lien partagé — qui ne différaient que par leurs
/// EN-TÊTES. Tout le reste (repli polling, échelle de reconnexion de Socket.IO,
/// épinglage de certificat, `permessage-deflate`) est la même décision pour les
/// deux populations, et une option ajoutée à une copie manquait silencieusement
/// à l'autre : un invité pouvait perdre une négociation que l'inscrit avait.
///
/// Ce que ce type ne décide PAS : ce qui voyage à la poignée de main. Les
/// en-têtes sont un PARAMÈTRE, dérivé du credential par l'appelant
/// (`MeeshyRequestCredential` est la porte de « sous quel en-tête ? »), et la
/// charge de `connect` reste au gestionnaire — un inscrit en pose une
/// (`ClientInfoProvider.socketAuthPayload()`), un invité non.
enum SocketTransportFactory {
    static func make(url: URL, headers: [String: String]) -> SocketManager {
        return SocketManager(socketURL: url, config: [
            .log(false),
            .handleQueue(.main),
            // CALL-FIX 2026-06-06 — WebSocket transport (polling handshake → auto
            // upgrade to WebSocket). The previous `.forcePolling(true)` (HTTP
            // long-poll ONLY) dropped mid-call: every re-poll under WebRTC CPU load
            // surfaced as "transport close" on the gateway, killing call:initiate /
            // SDP / ICE signaling (call stuck on "connecting"). The old "~35s the WS
            // dropped" was a ping timeout (gateway pingTimeout was 10s) — bumped to
            // 20s server-side, so the persistent WebSocket now holds.
            //
            // P4-1 évalué 2026-08-22 puis ÉCARTÉ : `.forceWebsockets(true)`
            // économiserait 1-2 RTT par connect mais supprime le REPLI polling
            // — contrairement au web (`transports: ['websocket','polling']`,
            // WS d'abord AVEC repli), un réseau qui casse l'upgrade WebSocket
            // (proxy TLS-inspectant, portail captif) perdrait tout temps réel.
            // À reconsidérer seulement avec un repli après N échecs.
            // Le jeton de SESSION voyage AVEC le JWT (#4213).
            //
            // Un socket inscrit s'authentifiait au JWT seul, et le serveur
            // n'avait donc aucun moyen de dire quel socket appartient à quelle
            // session : révoquer une session passait la ligne à
            // `isValid: false` et cet appareil continuait de tout recevoir —
            // `message:new`, `conversation:updated` — indéfiniment, un socket
            // n'étant authentifié qu'une fois, au connect, et jamais revérifié.
            //
            // En EN-TÊTE, comme le JWT et comme les appels REST : le serveur le
            // lit par `extractSessionToken`, qui accepte l'en-tête
            // `x-session-token` aussi bien que `handshake.auth`.
            .extraHeaders(headers),
            .reconnects(true),
            .reconnectWait(1),
            .reconnectWaitMax(16),
            .reconnectAttempts(-1),
            .sessionDelegate(CertificatePinningDelegate()),
            // BW-IOS-01 — negocie l'extension `permessage-deflate`. Le gateway
            // l'annonce depuis toujours (`perMessageDeflate`, seuil 256 o) mais
            // Starscream ne pose l'en-tete d'extension que si le manager le
            // demande : sans ce drapeau, TOUTES les trames iOS voyageaient non
            // compressees. Un intermediaire qui casserait l'extension fait
            // retomber le handshake sur des trames nues, jamais sur une
            // deconnexion.
            .compress,
        ])
    }
}
