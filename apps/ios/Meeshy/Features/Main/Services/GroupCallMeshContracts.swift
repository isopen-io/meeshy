import Foundation
import MeeshySDK

// Les contrats du maillage d'un appel de groupe (#3585). Le coordinateur ne
// connaît ni WebRTC ni la socket : il parle à une connexion par membre
// (`GroupPeerLinkProviding`), à l'émetteur de signaux
// (`GroupCallSignalingProviding`) et à l'appel que `CallManager` tient
// (`GroupCallHostProviding`) — trois frontières que les tests remplacent.

enum GroupCallSignalKind: String, Equatable, Sendable {
    case offer
    case answer
    case candidate = "ice-candidate"
}

/// Un signal qu'une connexion du maillage veut envoyer à SON membre.
struct GroupCallOutgoingSignal: Equatable, Sendable {
    let kind: GroupCallSignalKind
    let sdp: String?
    let candidate: String?
    let sdpMid: String?
    let sdpMLineIndex: Int?
    let negotiationId: Int

    static func description(_ kind: GroupCallSignalKind, sdp: String, negotiationId: Int) -> GroupCallOutgoingSignal {
        GroupCallOutgoingSignal(kind: kind, sdp: sdp, candidate: nil, sdpMid: nil, sdpMLineIndex: nil, negotiationId: negotiationId)
    }

    static func candidate(_ candidate: String, sdpMid: String?, sdpMLineIndex: Int, negotiationId: Int) -> GroupCallOutgoingSignal {
        GroupCallOutgoingSignal(kind: .candidate, sdp: nil, candidate: candidate, sdpMid: sdpMid, sdpMLineIndex: sdpMLineIndex, negotiationId: negotiationId)
    }

    /// La charge de `call:signal` — mêmes clés que `CallManager` (§3.5) :
    /// `sdpMLineIndex` est un ENTIER, la passerelle rejette une chaîne.
    func payload(from: String, to: String) -> [String: Any] {
        let base: [String: Any] = ["to": to, "from": from, "negotiationId": negotiationId]
        let described = sdp.map { base.merging(["sdp": $0]) { _, new in new } } ?? base
        let withCandidate = candidate.map {
            described.merging(["candidate": $0, "sdpMLineIndex": sdpMLineIndex ?? 0]) { _, new in new }
        } ?? described
        return sdpMid.map { withCandidate.merging(["sdpMid": $0]) { _, new in new } } ?? withCandidate
    }
}

/// Un signal reçu d'un membre du maillage.
struct GroupCallIncomingSignal: Equatable, Sendable {
    let kind: GroupCallSignalKind
    let from: String
    let sdp: String?
    let candidate: String?
    let sdpMid: String?
    let sdpMLineIndex: Int?
    let negotiationId: Int

    init(kind: GroupCallSignalKind, from: String, sdp: String? = nil, candidate: String? = nil, sdpMid: String? = nil, sdpMLineIndex: Int? = nil, negotiationId: Int = 0) {
        self.kind = kind
        self.from = from
        self.sdp = sdp
        self.candidate = candidate
        self.sdpMid = sdpMid
        self.sdpMLineIndex = sdpMLineIndex
        self.negotiationId = negotiationId
    }

    init?(_ payload: CallSignalPayload) {
        guard let kind = GroupCallSignalKind(rawValue: payload.type), let from = payload.from, !from.isEmpty else { return nil }
        self.init(
            kind: kind,
            from: from,
            sdp: payload.sdp,
            candidate: payload.candidate,
            sdpMid: payload.sdpMid,
            sdpMLineIndex: payload.sdpMLineIndex,
            negotiationId: payload.negotiationId ?? 0
        )
    }
}

/// Ce qu'une connexion du maillage rapporte au coordinateur.
enum GroupPeerLinkEvent: Equatable, Sendable {
    case signal(GroupCallOutgoingSignal)
    case state(GroupCallLinkState)
    /// Reprises épuisées : le membre est perdu pour cet appareil.
    case failed
    /// Une piste vidéo distante est arrivée (ou a changé).
    case remoteVideo
    /// Le canal de contrôle du lien est ouvert (aperçu avant décroché, #8795).
    case controlOpened
    /// Un message reçu sur le canal de contrôle.
    case control(Data)
}

struct GroupPeerLinkConfiguration: Sendable {
    let localUserId: String
    let remoteUserId: String
    let iceServers: [IceServer]
    /// Négociation parfaite : le plus petit identifiant est poli
    /// (`CallManager.isPolitePeer`, `peer-link.ts`).
    let isPolite: Bool
    let sendsAudio: Bool
    let sendsVideo: Bool
    /// L'aperçu avant décroché de l'appelé (#8480) : il reçoit, n'envoie rien.
    var receiveOnly = false
    /// L'aperçu de l'appelant (#8795) ouvre un canal de contrôle : l'appelé y
    /// dit qu'il a activé le son. Le répondant accepte celui qu'on lui ouvre.
    var opensControlChannel = false
}

extension IceServer {
    init(_ server: SocketIceServer) {
        self.init(urls: server.urls.asArray, username: server.username, credential: server.credential)
    }
}

/// UNE connexion pair-à-pair vers UN membre du groupe.
@MainActor
protocol GroupPeerLinkProviding: AnyObject, Sendable {
    var remoteUserId: String { get }
    /// La piste vidéo reçue du membre (`RTCVideoTrack` en production).
    var remoteVideoTrack: Any? { get }
    /// L'offre initiale — le membre déjà dans l'appel l'envoie au nouveau venu.
    func offer() async
    func receive(_ signal: GroupCallIncomingSignal) async
    func setAudioEnabled(_ enabled: Bool)
    func setVideoEnabled(_ enabled: Bool) async
    func updateIceServers(_ servers: [IceServer])
    /// Niveau audio reçu (0…1), `nil` tant qu'aucun paquet n'est arrivé.
    func audioLevel() async -> Double?
    func close()
    /// Envoie un message sur le canal de contrôle, s'il est ouvert (#8795).
    func sendControl(_ data: Data)
}

@MainActor
protocol GroupPeerLinkFactoryProviding: AnyObject {
    func makeLink(
        _ configuration: GroupPeerLinkConfiguration,
        onEvent: @escaping @MainActor (GroupPeerLinkEvent) -> Void
    ) -> any GroupPeerLinkProviding
}

/// L'émission de `call:signal` — `MessageSocketManager` la porte déjà.
@MainActor
protocol GroupCallSignalingProviding: AnyObject {
    func emitCallSignal(callId: String, type: String, payload: [String: Any])
}

/// L'appel que `CallManager` tient : le coordinateur y lit l'appel courant,
/// le pair principal et l'état des médias locaux.
@MainActor
protocol GroupCallHostProviding: AnyObject {
    var groupCallId: String? { get }
    var groupConversationId: String? { get }
    var groupLocalUserId: String { get }
    /// Le pair que `CallManager` négocie (`remoteUserId`).
    var groupPrimaryUserId: String? { get }
    var groupPrimaryDisplayName: String? { get }
    /// Un appel existe (sonnerie comprise) — `CallState.isActive`.
    var isGroupCallLive: Bool { get }
    /// L'appel est engagé : offre envoyée, connexion en cours, établie ou en reprise.
    var isGroupCallEngaged: Bool { get }
    var isGroupPrimaryConnected: Bool { get }
    var isLocalMicMuted: Bool { get }
    var isLocalVideoEnabled: Bool { get }
    var primaryRemoteVideoTrack: Any? { get }
    func primaryAudioLevel() async -> Double?
    /// #9085 — le principal a quitté un groupe qui continue : sa liaison n'est
    /// plus reprise, et l'appel reste établi par le maillage.
    func groupPrimaryDidVacate()
}
