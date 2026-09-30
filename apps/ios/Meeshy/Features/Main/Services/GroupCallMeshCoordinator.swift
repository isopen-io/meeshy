import Foundation
import Combine
import MeeshySDK
import os

/// Ce que la grille et `CallManager` demandent au maillage (#3585).
protocol GroupCallMeshProviding: AnyObject {
    var roster: GroupCallRoster { get }
    var speakingUserIds: Set<String> { get }
    var isGroupCallActive: Bool { get }
    func isGroupConversation(_ conversationId: String?) -> Bool
    func groupTitle(for conversationId: String?) -> String?
    func markGroupConversation(_ conversationId: String, title: String?)
    /// `true` quand le signal appartient au maillage — `CallManager` ne doit
    /// alors pas le traiter.
    func consume(signal: CallSignalPayload, callId: String) -> Bool
    func videoTrack(for userId: String) -> Any?
}

/// LE MAILLAGE D'UN APPEL DE GROUPE (#3585) — une connexion par membre
/// distant AUTRE que le pair principal que `CallManager` négocie déjà.
///
/// Loi d'offre du web (`engine.ts`) : le membre déjà dans l'appel offre au
/// nouveau venu à `call:participant-joined` ; le nouveau venu répond aux
/// offres qu'il reçoit. Une connexion qui échoue retire son membre sans
/// couper l'appel ; la fin de l'appel ferme tout.
@MainActor
final class GroupCallMeshCoordinator: ObservableObject, GroupCallMeshProviding {
    nonisolated deinit {}

    static let shared = GroupCallMeshCoordinator()

    @Published private(set) var roster: GroupCallRoster
    @Published private(set) var speakingUserIds: Set<String> = []
    @Published private(set) var isGroupCallActive = false
    /// Change à chaque piste vidéo reçue : la grille relit `videoTrack(for:)`.
    @Published private(set) var videoRevision = 0

    private weak var host: (any GroupCallHostProviding)?
    private let linkFactory: any GroupPeerLinkFactoryProviding
    private let signaling: any GroupCallSignalingProviding
    private let activeCalls: any ActiveCallServiceProviding
    private let now: () -> Date
    private let samplingInterval: Duration

    private var links: [String: any GroupPeerLinkProviding] = [:]
    private var iceServers: [IceServer] = []
    private var groupConversations: [String: String?] = [:]
    private var boundCallId: String?
    private var appliedMicMuted: Bool?
    private var appliedVideoEnabled: Bool?
    private var detector = ActiveSpeakerDetector()
    private var samplingTask: Task<Void, Never>?
    private var enrichedCallIds: Set<String> = []
    private var knownSession: ActiveCallSession?
    /// Un iPhone appelé REJOINT la salle dès la sonnerie : les membres déjà
    /// là lui offrent avant qu'il décroche, et les arrivants suivants
    /// l'attendent comme offrant. Ces offres et ces arrivées patientent ici
    /// jusqu'au décroché.
    private var pendingSignals: [String: [GroupCallIncomingSignal]] = [:]
    private var pendingArrivals: [String] = []
    private static let pendingSignalLimit = 64

    init(
        linkFactory: any GroupPeerLinkFactoryProviding = WebRTCGroupPeerLinkFactory.shared,
        signaling: any GroupCallSignalingProviding = MessageSocketManager.shared,
        activeCalls: any ActiveCallServiceProviding = ActiveCallService.shared,
        now: @escaping () -> Date = Date.init,
        samplingInterval: Duration = .milliseconds(400)
    ) {
        self.linkFactory = linkFactory
        self.signaling = signaling
        self.activeCalls = activeCalls
        self.now = now
        self.samplingInterval = samplingInterval
        self.roster = GroupCallRoster(localUserId: "")
    }

    func attach(host: any GroupCallHostProviding) {
        self.host = host
        syncWithHost()
    }

    func isAttached(to candidate: any GroupCallHostProviding) -> Bool {
        host === candidate
    }

    // MARK: - Nature de l'appel

    func markGroupConversation(_ conversationId: String, title: String?) {
        guard !conversationId.isEmpty else { return }
        groupConversations[conversationId] = .some(title)
    }

    func isGroupConversation(_ conversationId: String?) -> Bool {
        guard let conversationId else { return false }
        return groupConversations[conversationId] != nil
    }

    func groupTitle(for conversationId: String?) -> String? {
        guard let conversationId, let title = groupConversations[conversationId] else { return nil }
        return title
    }

    private var isGroupCall: Bool { isGroupConversation(host?.groupConversationId) }

    // MARK: - Événements de la passerelle

    func handleIncomingCall(_ event: CallOfferData) {
        // La passerelle pose `conversation.type` : tout ce qui n'est pas une
        // conversation directe peut réunir plus de deux membres.
        guard let type = event.conversationType, type != "direct" else { return }
        markGroupConversation(event.conversationId, title: event.conversationTitle)
        adoptIceServers(event.iceServers)
        syncWithHost()
    }

    func handleParticipantJoined(_ event: CallParticipantData) {
        guard let host, event.callId == host.groupCallId, let arrival = GroupCallArrival(event) else { return }
        let local = host.groupLocalUserId
        guard arrival.userId != local else { return }
        adoptIceServers(event.iceServers)
        let primary = host.groupPrimaryUserId
        // Dans un appel direct, le seul arrivant est le principal : un tiers
        // prouve que l'appel est de groupe (appel reçu par VoIP à froid, sans
        // `call:initiated`).
        if let conversationId = host.groupConversationId, let primary, !primary.isEmpty, arrival.userId != primary, !isGroupCall {
            markGroupConversation(conversationId, title: nil)
        }
        guard isGroupCall else { return }
        syncWithHost()
        guard boundCallId == event.callId else { return }
        guard roster.contains(arrival.userId) || !roster.isFull else {
            Logger.webrtc.info("[GROUP] arrival ignored — mesh full (\(self.roster.capacity))")
            return
        }
        roster = roster.admitting(arrival, isPrimary: arrival.userId == primary)
        guard isGroupCallActive else {
            pendingArrivals = pendingArrivals.filter { $0 != arrival.userId } + [arrival.userId]
            return
        }
        offer(to: arrival.userId)
    }

    private func offer(to userId: String) {
        guard let host, GroupSignalRouting.shouldOfferToArrival(
            arrivalUserId: userId,
            localUserId: host.groupLocalUserId,
            primaryUserId: host.groupPrimaryUserId,
            isInCall: host.isGroupCallEngaged
        ) else { return }
        links[userId]?.close()
        links[userId] = nil
        guard let link = makeLink(to: userId) else { return }
        Task { await link.offer() }
    }

    func handleParticipantLeft(_ event: CallParticipantData) {
        guard let host, event.callId == host.groupCallId, let userId = event.userId else { return }
        dropMember(userId)
    }

    func handleMediaToggled(_ event: CallMediaToggleData) {
        guard let host, event.callId == host.groupCallId, isGroupCall,
              let userId = event.userId, let kind = GroupCallMediaKind(rawValue: event.mediaType) else { return }
        roster = roster.applying(kind, enabled: event.enabled, for: userId)
    }

    func handleIceServersRefreshed(_ event: CallIceServersRefreshedData) {
        guard event.callId == host?.groupCallId else { return }
        adoptIceServers(event.iceServers)
        links.values.forEach { $0.updateIceServers(iceServers) }
    }

    func consume(signal: CallSignalPayload, callId: String) -> Bool {
        guard let host, callId == host.groupCallId else { return false }
        let destination = GroupSignalRouting.destination(
            from: signal.from,
            localUserId: host.groupLocalUserId,
            primaryUserId: host.groupPrimaryUserId,
            isGroupCall: isGroupCall
        )
        switch destination {
        case .primary:
            return false
        case .ignore:
            return true
        case .mesh(let userId):
            guard let incoming = GroupCallIncomingSignal(signal) else { return true }
            receive(incoming, from: userId)
            return true
        }
    }

    private func receive(_ signal: GroupCallIncomingSignal, from userId: String) {
        syncWithHost()
        guard boundCallId != nil else { return }
        guard isGroupCallActive else {
            buffer(signal, from: userId)
            return
        }
        let existing = links[userId]
        guard existing != nil || signal.kind == .offer else { return }
        if existing == nil {
            guard roster.contains(userId) || !roster.isFull else { return }
            // Un membre découvert par son offre n'a rien annoncé de ses médias :
            // il suit, jusqu'à son premier `media-toggled`, la nature de l'appel.
            let isVideoCall = host?.isLocalVideoEnabled ?? false
            roster = roster.admitting(GroupCallArrival(userId: userId, isVideoEnabled: isVideoCall))
            enrichNamesIfNeeded()
        }
        guard let link = existing ?? makeLink(to: userId) else { return }
        Task { await link.receive(signal) }
    }

    private func buffer(_ signal: GroupCallIncomingSignal, from userId: String) {
        let queued = signal.kind == .offer ? [] : (pendingSignals[userId] ?? [])
        guard signal.kind == .offer || !queued.isEmpty else { return }
        pendingSignals[userId] = Array((queued + [signal]).suffix(Self.pendingSignalLimit))
    }

    // MARK: - Suivi de l'appel tenu par CallManager

    /// Relu à chaque changement d'état, de micro ou de caméra de `CallManager`.
    func syncWithHost() {
        guard let host, let callId = host.groupCallId, isGroupCall, host.isGroupCallLive else {
            teardown()
            return
        }
        if boundCallId != callId {
            teardown()
            boundCallId = callId
            roster = GroupCallRoster(localUserId: host.groupLocalUserId)
        }
        adoptPrimary(host)
        guard host.isGroupCallEngaged else { return }
        let becameActive = !isGroupCallActive
        if becameActive { isGroupCallActive = true }
        applyLocalMedia(host)
        startSampling()
        if becameActive {
            flushPending()
            enrichNamesIfNeeded()
        }
    }

    private func flushPending() {
        let signals = pendingSignals
        let arrivals = pendingArrivals
        pendingSignals = [:]
        pendingArrivals = []
        signals.forEach { userId, queued in queued.forEach { receive($0, from: userId) } }
        arrivals.filter { links[$0] == nil && roster.contains($0) }.forEach { offer(to: $0) }
    }

    private func adoptPrimary(_ host: any GroupCallHostProviding) {
        guard let primary = host.groupPrimaryUserId, !primary.isEmpty, primary != host.groupLocalUserId else { return }
        links[primary]?.close()
        links[primary] = nil
        let name = host.groupPrimaryDisplayName.flatMap { $0.isEmpty ? nil : $0 }
        let admitted = roster.admitting(GroupCallArrival(userId: primary, displayName: name), isPrimary: true)
        roster = admitted.updatingLink(host.isGroupPrimaryConnected ? .connected : .connecting, for: primary)
    }

    private func applyLocalMedia(_ host: any GroupCallHostProviding) {
        let muted = host.isLocalMicMuted
        let video = host.isLocalVideoEnabled
        if appliedMicMuted != muted {
            appliedMicMuted = muted
            links.values.forEach { $0.setAudioEnabled(!muted) }
        }
        if appliedVideoEnabled != video {
            appliedVideoEnabled = video
            let current = Array(links.values)
            Task { for link in current { await link.setVideoEnabled(video) } }
        }
    }

    // MARK: - Connexions

    private func makeLink(to userId: String) -> (any GroupPeerLinkProviding)? {
        guard let host, let callId = host.groupCallId else { return nil }
        let local = host.groupLocalUserId
        let configuration = GroupPeerLinkConfiguration(
            localUserId: local,
            remoteUserId: userId,
            iceServers: iceServers.isEmpty ? IceServer.defaultServers : iceServers,
            isPolite: CallManager.isPolitePeer(localUserId: local, remoteUserId: userId),
            sendsAudio: !host.isLocalMicMuted,
            sendsVideo: host.isLocalVideoEnabled
        )
        let link = linkFactory.makeLink(configuration) { [weak self] event in
            self?.handle(event, from: userId, callId: callId)
        }
        links[userId] = link
        return link
    }

    private func handle(_ event: GroupPeerLinkEvent, from userId: String, callId: String) {
        guard boundCallId == callId, links[userId] != nil else { return }
        switch event {
        case .signal(let signal):
            guard let local = host?.groupLocalUserId else { return }
            signaling.emitCallSignal(callId: callId, type: signal.kind.rawValue, payload: signal.payload(from: local, to: userId))
        case .state(let state):
            roster = roster.updatingLink(state, for: userId)
        case .failed:
            Logger.webrtc.warning("[GROUP] mesh link failed — member dropped, call continues")
            dropMember(userId)
        case .remoteVideo:
            videoRevision += 1
        case .controlOpened, .control:
            // Le maillage n'ouvre aucun canal de contrôle : il sert l'aperçu.
            break
        }
    }

    private func dropMember(_ userId: String) {
        links[userId]?.close()
        links[userId] = nil
        roster = roster.removing(userId)
        detector = detector.forgetting(userId)
        speakingUserIds = detector.speakers
    }

    func videoTrack(for userId: String) -> Any? {
        if userId == host?.groupPrimaryUserId { return host?.primaryRemoteVideoTrack }
        return links[userId]?.remoteVideoTrack
    }

    private func adoptIceServers(_ servers: [SocketIceServer]?) {
        guard let servers, !servers.isEmpty else { return }
        iceServers = servers.map(IceServer.init)
    }

    /// L'appareil qui REJOINT un groupe ne reçoit aucun `participant-joined`
    /// pour les membres déjà là : leurs noms viennent de l'appel actif (REST).
    /// Lu UNE fois par appel, puis réappliqué à chaque membre découvert plus tard.
    private func enrichNamesIfNeeded() {
        guard let callId = boundCallId else { return }
        if let knownSession, knownSession.id == callId {
            enrich(with: knownSession, callId: callId)
            return
        }
        guard !enrichedCallIds.contains(callId), let conversationId = host?.groupConversationId else { return }
        enrichedCallIds.insert(callId)
        Task { [weak self, activeCalls] in
            guard let session = try? await activeCalls.activeCall(conversationId: conversationId) else { return }
            self?.enrich(with: session, callId: callId)
        }
    }

    private func enrich(with session: ActiveCallSession, callId: String) {
        guard boundCallId == callId, session.id == callId else { return }
        knownSession = session
        roster = session.participants.reduce(roster) { current, participant in
            guard current.contains(participant.userId) else { return current }
            let name = participant.user?.displayName ?? participant.user?.username
            return current.admitting(GroupCallArrival(userId: participant.userId, displayName: name, avatarURL: participant.user?.avatar))
        }
    }

    // MARK: - Qui parle

    private func startSampling() {
        guard samplingTask == nil else { return }
        let interval = samplingInterval
        samplingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: interval)
                guard !Task.isCancelled, let self else { return }
                await self.sampleAudioLevels()
            }
        }
    }

    func sampleAudioLevels() async {
        guard let host, isGroupCallActive else { return }
        let primary = host.groupPrimaryUserId
        let primaryLevel = await host.primaryAudioLevel()
        let current = links
        var levels: [String: Double] = [:]
        for (userId, link) in current {
            if let level = await link.audioLevel() { levels[userId] = level }
        }
        if let primary, let primaryLevel { levels[primary] = primaryLevel }
        detector = detector.recording(levels, at: now())
        let speakers = detector.speakers
        if speakers != speakingUserIds { speakingUserIds = speakers }
    }

    // MARK: - Fin

    private func teardown() {
        samplingTask?.cancel()
        samplingTask = nil
        links.values.forEach { $0.close() }
        links = [:]
        boundCallId = nil
        knownSession = nil
        pendingSignals = [:]
        pendingArrivals = []
        appliedMicMuted = nil
        appliedVideoEnabled = nil
        detector = ActiveSpeakerDetector()
        if !speakingUserIds.isEmpty { speakingUserIds = [] }
        if !roster.members.isEmpty { roster = GroupCallRoster(localUserId: roster.localUserId) }
        if isGroupCallActive { isGroupCallActive = false }
    }
}
