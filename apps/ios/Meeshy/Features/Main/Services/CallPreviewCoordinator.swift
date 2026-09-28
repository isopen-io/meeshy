import Foundation
import Combine
import MeeshySDK
import os

/// Où en est l'appel 1:1, vu de l'aperçu avant décroché (#8480).
enum CallPreviewPhase: Equatable, Sendable {
    case none
    /// L'appel entrant sonne dans l'app (écran `IncomingCallView`).
    case incomingRinging
    /// L'appel sortant attend que l'appelé décroche (`.ringing` puis `.offering`).
    case outgoingRinging
    /// Décroché, la connexion s'établit : le vrai lien prend le relais.
    case answering
    case connected
    case ended
}

/// Ce que l'aperçu lit de l'appel que `CallManager` tient.
struct CallPreviewHostState: Equatable, Sendable {
    let callId: String?
    let localUserId: String
    /// L'autre bout du 1:1 : l'appelant chez l'appelé, l'appelé chez l'appelant.
    let peerUserId: String?
    let phase: CallPreviewPhase
    let isGroup: Bool
    let isMicMuted: Bool
    let isVideoEnabled: Bool

    static let idle = CallPreviewHostState(callId: nil, localUserId: "", peerUserId: nil, phase: .none, isGroup: false, isMicMuted: false, isVideoEnabled: false)
}

/// Les deux émissions de l'aperçu — `MessageSocketManager` les porte.
@MainActor
protocol CallPreviewSignalingProviding: AnyObject {
    func requestCallPreview(callId: String)
    func emitCallPreviewSignal(callId: String, type: String, from: String, to: String, negotiationId: Int, fields: [String: Any])
    func emitRequestIceServers(callId: String)
}

/// Le son de l'aperçu et le micro de l'appelant : ce que seul `CallManager` peut toucher.
@MainActor
protocol CallPreviewHostActing: AnyObject {
    /// L'appelé choisit d'entendre l'appelant : le moteur audio démarre et la sonnerie se tait.
    func setPreviewAudible(_ audible: Bool)
    /// Le micro coupé pendant la sonnerie se rétablit à la connexion.
    func restoreMicAfterRinging()
}

/// **L'APERÇU AVANT DÉCROCHÉ** (#8480) — la jumelle iOS d'`engine-preview.ts`.
///
/// - **Appelé** : dès que l'appel 1:1 sonne dans l'app, il demande l'aperçu
///   (`call:preview-request`). L'offre de l'APPELANT, et de lui seul, ouvre un
///   lien en RÉCEPTION SEULE : ni micro ni caméra n'y partent, ils attendent le
///   décroché et le vrai lien. Ce qu'il reçoit s'affiche derrière la sonnerie,
///   muet tant qu'on n'active pas le son.
/// - **Appelant** : une demande pour SON appel qui sonne ouvre un lien qui offre
///   son micro et sa caméra, dans l'état où ils sont : un micro coupé pendant
///   la sonnerie ne s'entend pas, et se rétablit à la connexion.
///
/// Tout passe par `call:preview-signal`, jamais par `call:signal`, où une
/// réponse décrocherait l'appel. CallKit ne sait pas montrer de vidéo : sur
/// l'écran verrouillé, il n'y a pas d'aperçu.
@MainActor
final class CallPreviewCoordinator: ObservableObject {
    nonisolated deinit {}

    static let shared = CallPreviewCoordinator()

    /// Chez l'appelé : la vidéo de l'appelant (`RTCVideoTrack` en production).
    @Published private(set) var previewVideoTrack: Any?
    /// Chez l'appelé : le lien d'aperçu est établi, on peut l'écouter.
    @Published private(set) var isPreviewConnected = false
    /// Chez l'appelé : il a choisi d'entendre l'appelant.
    @Published private(set) var isPreviewAudible = false
    /// Chez l'appelant : l'appelé le voit (ou l'entend) avant de décrocher.
    @Published private(set) var isSeenByCallee = false

    private let linkFactory: any GroupPeerLinkFactoryProviding
    private let signaling: any CallPreviewSignalingProviding
    private weak var host: (any CallPreviewHostActing)?

    private var state = CallPreviewHostState.idle
    private var link: (any GroupPeerLinkProviding)?
    private var linkCallId: String?
    private var linkGeneration = 0
    private var requestedCallId: String?
    private var mutedWhileRinging = false
    private var iceServers: [String: [IceServer]] = [:]

    init(
        linkFactory: any GroupPeerLinkFactoryProviding = WebRTCGroupPeerLinkFactory.shared,
        signaling: any CallPreviewSignalingProviding = MessageSocketManager.shared
    ) {
        self.linkFactory = linkFactory
        self.signaling = signaling
    }

    func attach(host: any CallPreviewHostActing) {
        self.host = host
    }

    // MARK: - L'appel

    func sync(_ next: CallPreviewHostState) {
        let previous = state
        state = next
        if next.callId != previous.callId { resetCall(previous: previous) }
        switch next.phase {
        case .incomingRinging:
            requestPreviewIfNeeded()
        case .outgoingRinging:
            followLocalMedia(previous: previous)
        case .answering:
            closeLink(silencing: false)
        case .connected:
            closeLink(silencing: false)
            restoreMicIfMutedWhileRinging()
        case .ended, .none:
            closeLink(silencing: true)
            mutedWhileRinging = false
        }
    }

    /// Le bouton son de l'écran de sonnerie.
    func toggleSound() {
        guard state.phase == .incomingRinging, isPreviewConnected else { return }
        isPreviewAudible.toggle()
        host?.setPreviewAudible(isPreviewAudible)
    }

    // MARK: - La passerelle

    func handle(_ event: CallPreviewSocketEvent) {
        switch event {
        case .requested(let requested):
            openForCallee(requested)
        case .signal(let data):
            receive(data)
        }
    }

    func handleIncomingCall(_ event: CallOfferData) {
        adopt(event.iceServers, for: event.callId)
    }

    func handleIceServersRefreshed(_ event: CallIceServersRefreshedData) {
        adopt(event.iceServers, for: event.callId)
        guard event.callId == linkCallId, let servers = iceServers[event.callId] else { return }
        link?.updateIceServers(servers)
    }

    // MARK: - Appelé

    private func requestPreviewIfNeeded() {
        guard !state.isGroup, let callId = state.callId, requestedCallId != callId else { return }
        requestedCallId = callId
        signaling.requestCallPreview(callId: callId)
    }

    private func receive(_ data: CallAnswerData) {
        guard data.callId == state.callId, !state.isGroup,
              let signal = GroupCallIncomingSignal(data.signal),
              data.signal.to == state.localUserId else { return }
        if let link, linkCallId == data.callId, link.remoteUserId == signal.from {
            Task { await link.receive(signal) }
            return
        }
        guard state.phase == .incomingRinging, signal.from == state.peerUserId, signal.kind == .offer else { return }
        let opened = open(callId: data.callId, peer: signal.from, receiveOnly: true)
        Task { await opened.receive(signal) }
    }

    // MARK: - Appelant

    private func openForCallee(_ requested: CallPreviewRequestedEvent) {
        guard state.phase == .outgoingRinging, !state.isGroup, requested.callId == state.callId,
              requested.userId != state.localUserId,
              state.peerUserId == nil || requested.userId == state.peerUserId else { return }
        let opened = open(callId: requested.callId, peer: requested.userId, receiveOnly: false)
        Task { await opened.offer() }
    }

    private func followLocalMedia(previous: CallPreviewHostState) {
        let rang = previous.phase == .outgoingRinging && previous.callId == state.callId
        guard rang else { return }
        if state.isMicMuted != previous.isMicMuted {
            mutedWhileRinging = state.isMicMuted
            link?.setAudioEnabled(!state.isMicMuted)
        }
        if state.isVideoEnabled != previous.isVideoEnabled, let link {
            let enabled = state.isVideoEnabled
            Task { await link.setVideoEnabled(enabled) }
        }
    }

    private func restoreMicIfMutedWhileRinging() {
        guard mutedWhileRinging else { return }
        mutedWhileRinging = false
        guard state.isMicMuted else { return }
        host?.restoreMicAfterRinging()
    }

    // MARK: - Le lien

    private func open(callId: String, peer: String, receiveOnly: Bool) -> any GroupPeerLinkProviding {
        closeLink(silencing: true)
        let known = iceServers[callId] ?? []
        if known.isEmpty { signaling.emitRequestIceServers(callId: callId) }
        let configuration = GroupPeerLinkConfiguration(
            localUserId: state.localUserId,
            remoteUserId: peer,
            iceServers: known.isEmpty ? IceServer.defaultServers : known,
            isPolite: receiveOnly,
            sendsAudio: !receiveOnly && !state.isMicMuted,
            sendsVideo: !receiveOnly && state.isVideoEnabled,
            receiveOnly: receiveOnly
        )
        linkGeneration += 1
        let generation = linkGeneration
        let opened = linkFactory.makeLink(configuration) { [weak self] event in
            guard let self, self.linkGeneration == generation, let current = self.link else { return }
            self.linkEvent(event, from: current, callId: callId, receiveOnly: receiveOnly)
        }
        link = opened
        linkCallId = callId
        return opened
    }

    private func linkEvent(_ event: GroupPeerLinkEvent, from link: any GroupPeerLinkProviding, callId: String, receiveOnly: Bool) {
        switch event {
        case .signal(let signal):
            let local = state.localUserId
            let peer = link.remoteUserId
            signaling.emitCallPreviewSignal(
                callId: callId,
                type: signal.kind.rawValue,
                from: local,
                to: peer,
                negotiationId: signal.negotiationId,
                fields: signal.payload(from: local, to: peer)
            )
        case .state(let linkState):
            if receiveOnly { isPreviewConnected = linkState == .connected } else { isSeenByCallee = linkState == .connected }
        case .remoteVideo:
            guard receiveOnly else { return }
            previewVideoTrack = link.remoteVideoTrack
        case .failed:
            closeLink(silencing: true)
        }
    }

    private func closeLink(silencing: Bool) {
        linkGeneration += 1
        link?.close()
        link = nil
        linkCallId = nil
        previewVideoTrack = nil
        isPreviewConnected = false
        isSeenByCallee = false
        guard isPreviewAudible else { return }
        isPreviewAudible = false
        if silencing { host?.setPreviewAudible(false) }
    }

    private func resetCall(previous: CallPreviewHostState) {
        closeLink(silencing: true)
        requestedCallId = nil
        mutedWhileRinging = false
        if let callId = previous.callId { iceServers[callId] = nil }
    }

    private func adopt(_ servers: [SocketIceServer]?, for callId: String) {
        guard let servers, !servers.isEmpty else { return }
        iceServers[callId] = servers.map(IceServer.init)
    }
}

extension MessageSocketManager: CallPreviewSignalingProviding {}
