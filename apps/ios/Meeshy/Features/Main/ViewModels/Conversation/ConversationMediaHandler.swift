import Foundation
import MeeshySDK
import MeeshyUI

@MainActor
public final class ConversationMediaHandler {
    private let state: ConversationStateStore

    public init(state: ConversationStateStore) {
        self.state = state
    }

    func prefetchRecentMedia() {
        let snapshot = Array(state.messages.suffix(30).filter { !$0.attachments.isEmpty })
        Task(priority: .utility) {
            let store = await CacheCoordinator.shared.images
            await withTaskGroup(of: Void.self) { g in
                for msg in snapshot {
                    for att in msg.attachments {
                        if (att.type == .image || att.type == .video), !att.thumbnailUrl.isEmpty, let res = MeeshyConfig.resolveMediaURL(att.thumbnailUrl)?.absoluteString { g.addTask { _ = await store.image(for: res) } }
                    }
                }
            }
        }
    }
}
