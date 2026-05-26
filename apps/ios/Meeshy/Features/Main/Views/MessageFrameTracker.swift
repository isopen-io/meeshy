import CoreGraphics
import SwiftUI

/// SwiftUI `PreferenceKey` used by each bubble row to publish its screen
/// frame (in `.global` coordinates) up to `ConversationView`. The reduce step
/// merges per-cell entries; conflicting keys keep the latest value.
struct MessageFramePreferenceKey: PreferenceKey {
    static var defaultValue: [String: CGRect] = [:]

    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}

/// Tracks the most recent screen frame of each visible message bubble.
///
/// `ConversationView` owns one of these via `@State`. Each bubble row calls
/// `.preference(key: MessageFramePreferenceKey.self, ...)` in its
/// `.background(GeometryReader)`. The parent receives the aggregated map in
/// `.onPreferenceChange` and feeds it into `update(_:)`.
///
/// At long-press time the overlay reads `frame(for: messageId)` once and
/// freezes the value — the bubble must stay clued to its source position
/// even if the underlying list scrolls. See spec section 4.6.
///
/// Memory: an LRU cap of 200 entries protects against unbounded growth in
/// long-lived group conversations (see spec section 4.4 / 4.7). Recently
/// observed messages are kept; the least-recently-published frame is evicted
/// on overflow.
struct MessageFrameTracker: Equatable {
    private(set) var frames: [String: CGRect] = [:]
    private(set) var accessOrder: [String] = []

    let maxEntries: Int

    init(maxEntries: Int = 200) {
        self.maxEntries = maxEntries
    }

    /// Merge a batch of new frames. Existing IDs are updated in place and
    /// promoted to MRU; new IDs are appended; LRU eviction kicks in past the
    /// configured cap.
    mutating func update(_ newFrames: [String: CGRect]) {
        for (id, rect) in newFrames {
            if frames[id] == nil {
                accessOrder.append(id)
            } else if let idx = accessOrder.firstIndex(of: id) {
                accessOrder.remove(at: idx)
                accessOrder.append(id)
            }
            frames[id] = rect
        }
        while accessOrder.count > maxEntries {
            let evicted = accessOrder.removeFirst()
            frames.removeValue(forKey: evicted)
        }
    }

    func frame(for messageId: String) -> CGRect? {
        frames[messageId]
    }

    /// Targeted cleanup invoked on dismiss when the underlying message has
    /// been deleted between the long-press start and the overlay close.
    mutating func removeFrame(for messageId: String) {
        frames.removeValue(forKey: messageId)
        accessOrder.removeAll(where: { $0 == messageId })
    }
}
