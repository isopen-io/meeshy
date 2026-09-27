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
        }
    ) {
        self.start = start
        self.cachedPeer = cachedPeer
        self.fetchPeer = fetchPeer
        self.openProfile = openProfile
        self.showUnavailable = showUnavailable
    }

    func dial(_ request: CallBackRequest) {
        let openProfile = self.openProfile
        start(request.withDisplayNameFallback) { openProfile(request.userId) }
    }

    func dialFromProfile(_ request: ProfileCallRequest) {
        let showUnavailable = self.showUnavailable
        let callBack = CallBackRequest(
            userId: request.userId,
            displayName: request.displayName,
            isVideo: request.isVideo,
            conversationId: request.conversationId
        )
        start(callBack.withDisplayNameFallback) { showUnavailable() }
    }

    func dialConversation(id: String, isVideo: Bool) async {
        let resolved = await cachedPeer(id)
        let peer: CallPeer?
        if let resolved {
            peer = resolved
        } else {
            peer = await fetchPeer(id)
        }
        guard let peer else {
            showUnavailable()
            return
        }
        dial(CallBackRequest(userId: peer.userId, displayName: peer.displayName, isVideo: isVideo, conversationId: id))
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
