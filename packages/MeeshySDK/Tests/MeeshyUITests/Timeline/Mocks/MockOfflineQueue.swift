import Foundation
@testable import MeeshySDK

/// Test double for `OfflineQueueProviding`.
/// Captures enqueued items and tracks call counts.
actor MockOfflineQueue: OfflineQueueProviding {
    private(set) var enqueuedItems: [StoryOfflineQueueItem] = []
    private(set) var dequeuedIds: [String] = []

    var enqueueCallCount: Int { enqueuedItems.count }

    nonisolated func enqueue(_ item: StoryOfflineQueueItem) async {
        await _enqueue(item)
    }

    nonisolated func dequeue(_ itemId: String) async {
        await _dequeue(itemId)
    }

    nonisolated var pendingItems: [StoryOfflineQueueItem] {
        get async { await _pendingItems }
    }

    // MARK: - Private actor-isolated impl

    private func _enqueue(_ item: StoryOfflineQueueItem) {
        enqueuedItems.append(item)
    }

    private func _dequeue(_ id: String) {
        dequeuedIds.append(id)
    }

    private var _pendingItems: [StoryOfflineQueueItem] { enqueuedItems }

    func reset() {
        enqueuedItems = []
        dequeuedIds = []
    }
}
