import Foundation
import MeeshySDK
import os

@MainActor protocol SyncPillRouting: AnyObject, Sendable {
    func open(_ source: OutboxUIItem.Source) async
}

@MainActor protocol RoutePushing: AnyObject {
    func push(_ route: Route)
}

extension Router: RoutePushing {}

@MainActor
final class SyncPillRouter: SyncPillRouting {
    private let router: RoutePushing
    private let conversationLookup: @MainActor (String) -> Conversation?
    private let logger = Logger(subsystem: "me.meeshy.app", category: "sync-pill-router")

    init(
        router: RoutePushing,
        conversationLookup: @escaping @MainActor (String) -> Conversation?
    ) {
        self.router = router
        self.conversationLookup = conversationLookup
    }

    func open(_ source: OutboxUIItem.Source) async {
        switch source {
        case .conversation(let id):
            guard let conv = conversationLookup(id) else {
                logger.info("open conversation \(id, privacy: .public) — not in cache, skipping")
                return
            }
            router.push(.conversation(conv))
        case .post(let id):
            router.push(.postDetail(id, nil, showComments: false))
        case .story:
            logger.info("open story — v1 no-op (needs StoryIntent + StoryNotificationContext)")
            return
        case .unknown:
            return
        }
    }
}
