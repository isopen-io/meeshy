import Combine
import Foundation
import MeeshySDK
import os

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

    private init() {}

    /// Idempotent bootstrap. Wires the publish handler and observes network state.
    public func start() {
        guard !didStart else { return }
        didStart = true

        // Wire publish handler — when the queue flushes, forward each item to
        // StoryPublishService (the production publish path).
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

    // MARK: - Private

    /// Forwards a queued story item to the production publish service.
    ///
    /// `StoryPublishService` is responsible for uploading slides + media.
    /// Returns `true` when the item is published successfully (or permanently
    /// rejected), `false` when a transient failure should keep it queued.
    private func publish(item: StoryOfflineQueueItem) async -> Bool {
        // TODO: forward to the concrete publish executor once it stabilises.
        // StoryPublishService.shared.publishOfflineItem(item) is the intended
        // final wiring — left as a stub until that API is merged.
        logger.info("""
            StoryOfflineQueueBootstrap: publish stub for item \
            \(item.slideIds.first ?? "<none>", privacy: .public). \
            Wire StoryPublishService.shared.publishOfflineItem(_:) here.
            """)
        // Return false so the item stays queued rather than being silently dropped
        // before the real executor is wired in.
        return false
    }
}
