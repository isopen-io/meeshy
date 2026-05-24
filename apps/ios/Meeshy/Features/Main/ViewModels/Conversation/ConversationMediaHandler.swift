import Foundation
import MeeshySDK
import MeeshyUI

/// Conversation-side prefetcher for visible/recent media. Drops down to the
/// shared `CacheCoordinator.images` to warm the on-disk store ahead of any
/// user scroll so the bubble grid never blocks on a network round-trip.
///
/// Internal visibility: app-side orchestrator (per `[[sdk-purity]]`).
@MainActor
final class ConversationMediaHandler {
    private let state: ConversationStateStore

    init(state: ConversationStateStore) {
        self.state = state
    }

    func prefetchRecentMedia() {
        let snapshot = Array(state.messages.suffix(30).filter { !$0.attachments.isEmpty })
        Task(priority: .utility) {
            let store = await CacheCoordinator.shared.images
            await withTaskGroup(of: Void.self) { g in
                for msg in snapshot {
                    for att in msg.attachments {
                        guard att.type == .image || att.type == .video else { continue }
                        guard let thumb = att.thumbnailUrl, !thumb.isEmpty else { continue }
                        guard let res = MeeshyConfig.resolveMediaURL(thumb)?.absoluteString else { continue }
                        g.addTask { _ = await store.image(for: res) }
                    }
                }
            }
        }
    }
}
