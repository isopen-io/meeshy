import Combine
import Foundation
import MeeshySDK
import os

// MARK: - OfflineToPublishBridging (test seam)

/// Protocol bridging items dequeued from `StoryOfflineQueue` into the
/// production `StoryPublishQueue`. The protocol exists purely as a test seam
/// — production code wires the default implementation, tests inject a spy
/// to assert what the bootstrap forwards on each flush attempt.
public protocol OfflineToPublishBridging: Sendable {
    /// Enqueues a publish-ready item into the downstream queue. Returns
    /// `true` when the downstream queue accepted the item (so the offline
    /// queue can drop it), `false` when the hand-off failed and the item
    /// must remain queued for the next attempt.
    func enqueueForPublish(_ item: StoryPublishQueueItem) async -> Bool
}

/// Default bridge that forwards to `StoryPublishQueue.shared`.
///
/// The publish queue is the production retry/upload pipeline owned by
/// `StoryPublishService` in the app target. Once an item lands there the
/// existing executor + exponential-backoff machinery takes over.
struct DefaultOfflineToPublishBridge: OfflineToPublishBridging {
    func enqueueForPublish(_ item: StoryPublishQueueItem) async -> Bool {
        _ = await StoryPublishQueue.shared.enqueue(item)
        return true
    }
}

// MARK: - StoryOfflineQueueBootstrap

/// Wires `StoryOfflineQueue` to its production publish handler and triggers
/// `flush()` whenever `NetworkMonitor` reports the device is back online.
///
/// Call `StoryOfflineQueueBootstrap.shared.start()` once at app launch (from
/// `MeeshyApp.init` or the root `.task`). The method is idempotent — multiple
/// calls after the first are no-ops.
@MainActor
public final class StoryOfflineQueueBootstrap {

    public static let shared = StoryOfflineQueueBootstrap()

    private var cancellables: Set<AnyCancellable> = []
    private var didStart = false
    private let logger = Logger(subsystem: "me.meeshy.app", category: "media")
    private let bridge: OfflineToPublishBridging

    /// Production initialiser uses the default `StoryPublishQueue` bridge.
    private convenience init() {
        self.init(bridge: DefaultOfflineToPublishBridge())
    }

    /// Test seam: inject a custom bridge to assert hand-off behaviour without
    /// touching the singleton `StoryPublishQueue`.
    init(bridge: OfflineToPublishBridging) {
        self.bridge = bridge
    }

    /// Idempotent bootstrap. Wires the publish handler and observes network state.
    public func start() {
        guard !didStart else { return }
        didStart = true

        // Wire publish handler — when the queue flushes, forward each item to
        // the publish queue (the production retry/upload pipeline).
        Task {
            await StoryOfflineQueue.shared.setOnPublish { [weak self] item in
                guard let self else { return false }
                return await self.publish(item: item)
            }
        }

        // Observe network state changes: flush the queue when the device comes
        // back online. `removeDuplicates()` avoids spurious flushes on repeated
        // `isOffline = false` emissions.
        NetworkMonitor.shared.$isOffline
            .removeDuplicates()
            .sink { isOffline in
                guard !isOffline else { return }
                Task { await StoryOfflineQueue.shared.flush() }
            }
            .store(in: &cancellables)
    }

    // MARK: - Bridge

    /// Forwards a queued story item to the production publish pipeline.
    ///
    /// Maps `StoryOfflineQueueItem` -> `StoryPublishQueueItem`:
    ///   - `slidePayloadJSON` (UTF-8 string) -> `slidesPayload` (Data)
    ///   - `mediaURLPaths` -> `[StoryMediaReference]` tagged `video`/`image` (by extension)
    ///   - `audioURLPaths` -> `[StoryMediaReference]` tagged as `audio`
    ///   - `originalLanguage` is propagated for the Prisme Linguistique pipeline
    ///   - `visibility` is propagated verbatim
    ///
    /// Returns `true` when the publish queue accepts the item (so the offline
    /// queue drops it), `false` when the payload cannot be re-encoded or the
    /// bridge rejected the hand-off (so the item stays queued for the next
    /// connectivity-triggered flush).
    func publish(item: StoryOfflineQueueItem) async -> Bool {
        guard let payload = item.slidePayloadJSON.data(using: .utf8),
              !payload.isEmpty else {
            logger.error("""
                StoryOfflineQueueBootstrap: cannot encode slidePayloadJSON for \
                item \(item.id, privacy: .public) — keeping item queued.
                """)
            return false
        }

        let mediaRefs = item.mediaURLPaths.map { (elementId, path) in
            StoryMediaReference(
                elementId: elementId,
                mediaType: StoryMediaReference.inferVisualMediaType(forPath: path),
                localFilePath: path
            )
        }
        let audioRefs = item.audioURLPaths.map { (elementId, path) in
            StoryMediaReference(elementId: elementId, mediaType: "audio", localFilePath: path)
        }

        let publishItem = StoryPublishQueueItem(
            visibility: item.visibility,
            slidesPayload: payload,
            repostOfId: nil,
            mediaReferences: mediaRefs + audioRefs,
            originalLanguage: item.originalLanguage
        )

        let accepted = await bridge.enqueueForPublish(publishItem)
        if accepted {
            logger.info("""
                StoryOfflineQueueBootstrap: forwarded item \
                \(item.id, privacy: .public) to publish queue.
                """)
        } else {
            logger.warning("""
                StoryOfflineQueueBootstrap: publish bridge rejected item \
                \(item.id, privacy: .public) — keeping item queued.
                """)
        }
        return accepted
    }
}
