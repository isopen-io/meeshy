import Foundation
import MeeshySDK
import MeeshyUI

@MainActor
protocol CallBackDialerProviding {
    func dial(_ request: CallBackRequest)
    func dialFromProfile(_ request: ProfileCallRequest)
    func dialConversation(id: String, isVideo: Bool) async
}

@MainActor
final class CallBackDialer: CallBackDialerProviding {
    nonisolated deinit {}

    static let shared = CallBackDialer()

    private let start: @MainActor (CallBackRequest, @escaping () -> Void) -> Void
    private let cachedPeer: @MainActor (String) async -> CallPeer?
    private let fetchPeer: @MainActor (String) async -> CallPeer?
    private let openProfile: @MainActor (String) -> Void
    private let showUnavailable: @MainActor () -> Void
    private let readiness: CallDialReadinessProviding
    private let showNotConnected: @MainActor () -> Void
    private var inFlight: Task<Void, Never>?

    /// Le rappel qui attend la connexion (#8199). Une seule attente à la fois :
    /// une nouvelle demande remplace la précédente, qui ne compose jamais.
    var inFlightDial: Task<Void, Never>? { inFlight }

    init(
        start: @escaping @MainActor (CallBackRequest, @escaping () -> Void) -> Void = { request, onUnavailable in
            CallStarter.start(
                userId: request.userId,
                displayName: request.displayName,
                isVideo: request.isVideo,
                conversationId: request.conversationId,
                onUnavailable: onUnavailable
            )
        },
        cachedPeer: @escaping @MainActor (String) async -> CallPeer? = { conversationId in
            await ConversationStore.shared.conversation(id: conversationId).flatMap(CallPeer.init(directConversation:))
        },
        fetchPeer: @escaping @MainActor (String) async -> CallPeer? = { conversationId in
            guard let currentUserId = AuthManager.shared.currentUser?.id,
                  let conversation = try? await ConversationService.shared.getById(conversationId) else { return nil }
            return CallPeer(directConversation: conversation.toConversation(currentUserId: currentUserId))
        },
        openProfile: @escaping @MainActor (String) -> Void = { userId in
            DeepLinkRouter.shared.pendingDeepLink = .userProfile(username: userId)
        },
        showUnavailable: @escaping @MainActor () -> Void = {
            FeedbackToastManager.shared.showError(
                String(localized: "call.starter.unavailable", defaultValue: "Impossible de démarrer l'appel", bundle: .main)
            )
        },
        readiness: CallDialReadinessProviding? = nil,
        showNotConnected: @escaping @MainActor () -> Void = {
            FeedbackToastManager.shared.showError(
                String(localized: "call.dial.notConnected", defaultValue: "Pas de connexion : l'appel n'est pas parti", bundle: .main)
            )
        }
    ) {
        self.start = start
        self.cachedPeer = cachedPeer
        self.fetchPeer = fetchPeer
        self.openProfile = openProfile
        self.showUnavailable = showUnavailable
        self.readiness = readiness ?? CallDialReadiness.shared
        self.showNotConnected = showNotConnected
    }

    func dial(_ request: CallBackRequest) {
        let openProfile = self.openProfile
        let userId = request.userId
        place(request.withDisplayNameFallback) { openProfile(userId) }
    }

    func dialFromProfile(_ request: ProfileCallRequest) {
        let showUnavailable = self.showUnavailable
        let callBack = CallBackRequest(
            userId: request.userId,
            displayName: request.displayName,
            isVideo: request.isVideo,
            conversationId: request.conversationId
        )
        place(callBack.withDisplayNameFallback) { showUnavailable() }
    }

    func dialConversation(id: String, isVideo: Bool) async {
        inFlight?.cancel()
        let task = Task { await self.resolveThenStart(conversationId: id, isVideo: isVideo) }
        inFlight = task
        await task.value
    }

    /// Prêt : l'appel part tout de suite, sans détour. Sinon il attend la
    /// session et le socket, et c'est la DERNIÈRE demande qui part.
    private func place(_ request: CallBackRequest, onUnavailable: @escaping () -> Void) {
        inFlight?.cancel()
        inFlight = nil
        guard !readiness.isReady else {
            start(request, onUnavailable)
            return
        }
        inFlight = Task {
            guard await self.awaitReadiness() else { return }
            self.start(request, onUnavailable)
        }
    }

    /// Le pair se résout APRÈS la connexion : au démarrage à froid, le cache
    /// des conversations et l'utilisateur courant ne sont pas encore là.
    private func resolveThenStart(conversationId: String, isVideo: Bool) async {
        guard await awaitReadiness() else { return }
        let resolved = await cachedPeer(conversationId)
        let peer: CallPeer?
        if let resolved {
            peer = resolved
        } else {
            peer = await fetchPeer(conversationId)
        }
        guard !Task.isCancelled else { return }
        guard let peer else {
            showUnavailable()
            return
        }
        let openProfile = self.openProfile
        let request = CallBackRequest(userId: peer.userId, displayName: peer.displayName, isVideo: isVideo, conversationId: conversationId)
        start(request.withDisplayNameFallback) { openProfile(peer.userId) }
    }

    private func awaitReadiness() async -> Bool {
        if readiness.isReady { return true }
        let outcome = await readiness.waitUntilReady()
        guard !Task.isCancelled else { return false }
        switch outcome {
        case .ready:
            return true
        case .timedOut:
            showNotConnected()
            return false
        case .signedOut:
            return false
        }
    }
}

extension CallPeer {
    init?(directConversation conversation: MeeshyConversation) {
        guard conversation.type == .direct,
              let userId = conversation.participantUserId, !userId.isEmpty else { return nil }
        self.init(userId: userId, displayName: conversation.displayName)
    }
}

private extension CallBackRequest {
    var withDisplayNameFallback: CallBackRequest {
        guard displayName.isEmpty else { return self }
        return CallBackRequest(
            userId: userId,
            displayName: String(localized: "call.peer.fallback", defaultValue: "Appel", bundle: .main),
            isVideo: isVideo,
            conversationId: conversationId
        )
    }
}
