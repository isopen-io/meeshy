import Foundation
import os
import GRDB

/// Notification posted after MessagePersistenceActor commits a write that may
/// have changed the messages of a conversation. MessageStore listens for this
/// notification instead of using GRDB observation, which crashes under Swift 6
/// strict concurrency interop with the GRDB Swift module.
/// The notification's `userInfo["conversationId"]` is a `String` identifying
/// the conversation. `nil` means "may affect any conversation".
public extension Notification.Name {
    static let messageStoreShouldRefresh = Notification.Name("me.meeshy.messageStore.shouldRefresh")
}

/// Posts the `messageStoreShouldRefresh` notification on the main thread for
/// the given conversation IDs. Called after any write through
/// MessagePersistenceActor that may affect the displayed message list.
///
/// `MessageStore.startObserving(...)` filters notifications by
/// `userInfo["conversationId"]` and silently rejects anything else, so
/// posting with an empty set is a programming error: the GRDB row is
/// updated but no observer ever fires. We assert in DEBUG to catch
/// mistakes early (see fix 6c6270d1 + the 15-method follow-up) and
/// no-op in release rather than emit the misleading wildcard notif
/// the previous implementation produced.
func postMessageStoreRefresh(conversationIds: Set<String>) {
    assert(!conversationIds.isEmpty,
           "postMessageStoreRefresh called with empty Set<String> — every mutation method on MessagePersistenceActor must scope its refresh to the affected conversationId. Otherwise MessageStore observers drop the notification and the UI freezes on its last cached state.")
    guard !conversationIds.isEmpty else { return }
    DispatchQueue.main.async {
        for convId in conversationIds {
            NotificationCenter.default.post(
                name: .messageStoreShouldRefresh,
                object: nil,
                userInfo: ["conversationId": convId]
            )
        }
    }
}
