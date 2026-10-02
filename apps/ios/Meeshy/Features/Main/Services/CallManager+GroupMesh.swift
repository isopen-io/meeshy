import Combine
import Foundation
import MeeshySDK
import os

// L'appel de groupe côté `CallManager` (#3585). `CallManager` garde UN pair —
// le « principal » — et tout le reste du groupe vit dans le maillage de
// `GroupCallMeshCoordinator`. Ce fichier est la couture entre les deux : ce
// que le coordinateur lit de l'appel, ce que `CallManager` lui cède, et le
// démarrage d'un appel de groupe.

extension CallManager: GroupCallHostProviding {
    var groupCallId: String? { currentCallId }
    var groupConversationId: String? { conversationId }
    var groupLocalUserId: String { AuthManager.shared.currentUser?.id ?? "" }

    /// Tant que l'appelant d'un groupe n'a vu personne rejoindre, `remoteUserId`
    /// porte l'identifiant de la CONVERSATION (la poignée CallKit) : ce n'est
    /// pas un pair.
    var groupPrimaryUserId: String? {
        guard let remoteUserId, !remoteUserId.isEmpty, remoteUserId != conversationId else { return nil }
        return remoteUserId
    }

    /// `remoteUsername` porte le TITRE du groupe chez l'appelant : ce n'est
    /// pas le nom du pair principal.
    var groupPrimaryDisplayName: String? {
        guard let remoteUsername, !remoteUsername.isEmpty,
              remoteUsername != GroupCallMeshCoordinator.shared.groupTitle(for: conversationId) else { return nil }
        return remoteUsername
    }

    var isGroupCallLive: Bool { callState.isActive }

    var isGroupCallEngaged: Bool {
        switch callState {
        case .offering, .connecting, .connected, .reconnecting: return true
        case .idle, .ringing, .ended: return false
        }
    }

    var isGroupPrimaryConnected: Bool { callState == .connected }
    var isLocalMicMuted: Bool { isMuted }
    var isLocalVideoEnabled: Bool { isVideoEnabled }
    var primaryRemoteVideoTrack: Any? { webRTCService.remoteVideoTrack }

    func primaryAudioLevel() async -> Double? {
        await webRTCService.getStats()?.inboundAudioLevel
    }

    // MARK: - Ce que CallManager cède au maillage

    private var groupMesh: GroupCallMeshCoordinator? {
        let mesh = GroupCallMeshCoordinator.shared
        return mesh.isAttached(to: self) ? mesh : nil
    }

    /// `true` quand le signal vient d'un membre du groupe AUTRE que le pair
    /// principal : il appartient au maillage, et le traiter ici corromprait la
    /// connexion principale.
    func routesToGroupMesh(_ signal: CallSignalPayload, callId: String) -> Bool {
        guard let mesh = groupMesh else { return false }
        // Rejoindre un groupe en cours : personne n'est encore désigné, et le
        // premier membre qui offre devient le pair principal.
        if signal.type == GroupCallSignalKind.offer.rawValue, callId == currentCallId,
           mesh.isGroupConversation(conversationId), let from = signal.from {
            designateGroupPrimary(userId: from)
        }
        return mesh.consume(signal: signal, callId: callId)
    }

    /// La caméra ou le micro d'un membre du maillage n'est pas celui du pair
    /// principal : `isRemoteVideoEnabled` / `isRemoteAudioEnabled` restent à lui.
    /// Son siège libéré (#9085), tout membre est du maillage.
    func isGroupMeshMediaToggle(_ event: CallMediaToggleData) -> Bool {
        guard let mesh = groupMesh, mesh.isGroupConversation(conversationId),
              let userId = event.userId, !userId.isEmpty else { return false }
        return mesh.isPrimaryVacated || userId != groupPrimaryUserId
    }

    /// Un appel de groupe tenu par le maillage — le 1:1 n'y entre jamais.
    var isGroupMeshCall: Bool { groupMesh?.isGroupConversation(conversationId) ?? false }

    /// #9085 — le principal est parti, le groupe continue sans lui.
    var isGroupPrimaryVacated: Bool { groupMesh?.isPrimaryVacated ?? false }

    /// #9085 — le `bye` in-band vient toujours du principal. En groupe, s'il
    /// reste des membres, il libère son siège sans finir l'appel ; sinon
    /// (1:1, ou plus personne) l'appel finit comme avant.
    func handleRemoteBye(callId: String, rawReason: String?) {
        if groupMesh?.primaryDidLeave() == true {
            Logger.calls.info("[GROUP] bye from the primary — seat vacated, call continues")
            return
        }
        handleRemoteEnd(callId: callId, rawReason: rawReason)
    }

    /// L'appelant d'un groupe n'a pas de pair désigné : le PREMIER membre qui
    /// rejoint le devient, et les suivants passent par le maillage.
    func designateGroupPrimary(from event: CallParticipantData) {
        guard let userId = event.userId else { return }
        designateGroupPrimary(userId: userId)
    }

    private func designateGroupPrimary(userId: String) {
        guard let placeholder = conversationId, remoteUserId == placeholder,
              !userId.isEmpty, userId != groupLocalUserId else { return }
        remoteUserId = userId
        webRTCService.setNegotiationRole(isPolite: Self.isPolitePeer(localUserId: groupLocalUserId, remoteUserId: userId))
    }

    /// Une offre adressée à la CONVERSATION (appelant d'un groupe) part au pair
    /// principal désigné — la passerelle ne relaie qu'à un participant.
    func offerTarget(for toUserId: String) -> String {
        guard toUserId == conversationId, let primary = groupPrimaryUserId else { return toUserId }
        return primary
    }

    // MARK: - Démarrer un appel de groupe

    /// La poignée CallKit d'un groupe est la conversation, son nom le titre du
    /// groupe : les Récents du téléphone rappellent le groupe, pas un membre.
    @discardableResult
    func startGroupCall(conversationId: String, title: String, isVideo: Bool) async -> Bool {
        GroupCallMeshCoordinator.shared.markGroupConversation(conversationId, title: title)
        return await requestPermissionsThenStartCall(
            conversationId: conversationId,
            userId: conversationId,
            displayName: title,
            isVideo: isVideo
        )
    }
}

extension MessageSocketManager: GroupCallSignalingProviding {}

/// Relie la pile d'appel au maillage : les événements de groupe du socket vont
/// au coordinateur, et chaque changement d'état, de micro ou de caméra de
/// `CallManager` le fait se réaligner.
@MainActor
final class GroupCallMeshBinding {
    nonisolated deinit {}

    static let shared = GroupCallMeshBinding()

    private let mesh: GroupCallMeshCoordinator
    private var cancellables = Set<AnyCancellable>()
    private weak var boundManager: CallManager?

    init(mesh: GroupCallMeshCoordinator = .shared) {
        self.mesh = mesh
    }

    func bind(_ manager: CallManager, socket: MessageSocketManager = .shared) {
        guard boundManager !== manager else { return }
        boundManager = manager
        cancellables = []
        mesh.attach(host: manager)

        socket.callOfferReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.mesh.handleIncomingCall($0) }
            .store(in: &cancellables)
        socket.callParticipantJoined
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.mesh.handleParticipantJoined($0) }
            .store(in: &cancellables)
        socket.callParticipantLeft
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.mesh.handleParticipantLeft($0) }
            .store(in: &cancellables)
        socket.callMediaToggled
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.mesh.handleMediaToggled($0) }
            .store(in: &cancellables)
        socket.callIceServersRefreshed
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.mesh.handleIceServersRefreshed($0) }
            .store(in: &cancellables)

        let state = manager.$callState.map { _ in () }
        let primary = manager.$remoteUserId.map { _ in () }
        let muted = manager.$isMuted.map { _ in () }
        let video = manager.$isVideoEnabled.map { _ in () }
        let call = manager.$currentCallId.map { _ in () }
        Publishers.Merge5(state, primary, muted, video, call)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.mesh.syncWithHost() }
            .store(in: &cancellables)
    }
}

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
