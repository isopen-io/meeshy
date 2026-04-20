import BackgroundTasks
import MeeshySDK
import os

private let logger = Logger(subsystem: "me.meeshy.app", category: "background")

@MainActor
final class BackgroundTaskManager {
    static let shared = BackgroundTaskManager()

    static let conversationSyncTaskId = "me.meeshy.app.conversation-sync"
    static let messagePrefetchTaskId = "me.meeshy.app.message-prefetch"

    // Exponential backoff: 1min → 2min → 4min → 8min → cap at 15min so a
    // temporarily-unreachable backend doesn't force a 15 min wait between
    // sync attempts on the next wake-up. On success we reset to the normal
    // 15 min interval.
    private static let baseRetryInterval: TimeInterval = 60
    private static let maxRetryInterval: TimeInterval = 15 * 60
    private static let normalSyncInterval: TimeInterval = 15 * 60
    private static let normalPrefetchInterval: TimeInterval = 30 * 60
    private static let syncFailureCountKey = "me.meeshy.bgtask.syncFailures"

    private var activeSyncTask: Task<Void, Never>?
    private var activePrefetchTask: Task<Void, Never>?

    private init() {}

    private var syncFailureCount: Int {
        get { UserDefaults.standard.integer(forKey: Self.syncFailureCountKey) }
        set { UserDefaults.standard.set(max(newValue, 0), forKey: Self.syncFailureCountKey) }
    }

    private func nextSyncDelay(succeeded: Bool) -> TimeInterval {
        if succeeded {
            syncFailureCount = 0
            return Self.normalSyncInterval
        }
        syncFailureCount += 1
        let exp = pow(2.0, Double(min(syncFailureCount, 8)))
        return min(Self.baseRetryInterval * exp, Self.maxRetryInterval)
    }

    func registerTasks() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.conversationSyncTaskId,
            using: nil
        ) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            Task { @MainActor [weak self] in
                await self?.handleConversationSync(task: refreshTask)
            }
        }

        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.messagePrefetchTaskId,
            using: nil
        ) { task in
            guard let processingTask = task as? BGProcessingTask else {
                task.setTaskCompleted(success: false)
                return
            }
            Task { @MainActor [weak self] in
                await self?.handleMessagePrefetch(task: processingTask)
            }
        }

        logger.info("Background tasks registered")
    }

    func scheduleConversationSync(after delay: TimeInterval? = nil) {
        // Jitter: ±20% of the base interval. Prevents every device from
        // waking up at exactly the same second on the minute boundary,
        // which is the "thundering herd" that takes the gateway down if a
        // major deploy pushes a simultaneous sync. Random draw is stable
        // per-call so we don't accidentally shrink an intentionally short
        // backoff interval.
        let base = delay ?? Self.normalSyncInterval
        let jitter = Double.random(in: -0.2...0.2) * base
        let final = max(30, base + jitter)
        let request = BGAppRefreshTaskRequest(identifier: Self.conversationSyncTaskId)
        request.earliestBeginDate = Date(timeIntervalSinceNow: final)

        do {
            try BGTaskScheduler.shared.submit(request)
            logger.info("Conversation sync scheduled in \(Int(final))s (base=\(Int(base))s)")
        } catch {
            logger.error("Failed to schedule conversation sync: \(error.localizedDescription)")
        }
    }

    func scheduleMessagePrefetch() {
        let request = BGProcessingTaskRequest(identifier: Self.messagePrefetchTaskId)
        request.requiresNetworkConnectivity = true
        // Same ±20% jitter as the sync scheduler so prefetch windows don't
        // stack up across the whole install base every half-hour.
        let jitter = Double.random(in: -0.2...0.2) * Self.normalPrefetchInterval
        request.earliestBeginDate = Date(timeIntervalSinceNow: Self.normalPrefetchInterval + jitter)

        do {
            try BGTaskScheduler.shared.submit(request)
            logger.info("Message prefetch scheduled")
        } catch {
            logger.error("Failed to schedule message prefetch: \(error.localizedDescription)")
        }
    }

    // MARK: - Task Handlers

    private func handleConversationSync(task: BGAppRefreshTask) async {
        let syncTask = Task<Bool, Never> {
            await ConversationSyncEngine.shared.syncSinceLastCheckpoint()
        }
        activeSyncTask = Task { _ = await syncTask.value }

        task.expirationHandler = {
            syncTask.cancel()
        }

        let succeeded = await syncTask.value && !syncTask.isCancelled
        activeSyncTask = nil

        // Reschedule *after* knowing the outcome so we back off on failure
        // (net error, token expiry, etc.) instead of waiting another 15 min.
        let delay = nextSyncDelay(succeeded: succeeded)
        scheduleConversationSync(after: delay)

        task.setTaskCompleted(success: succeeded)
        logger.info("Background conversation sync completed: success=\(succeeded), nextIn=\(Int(delay))s")
    }

    private func handleMessagePrefetch(task: BGProcessingTask) async {
        scheduleMessagePrefetch()

        let prefetchTask = Task {
            let conversations = await CacheCoordinator.shared.conversations.load(for: "list")
            guard let items = conversations.value else { return }

            let unreadConversations = items.filter { $0.unreadCount > 0 }
            for conversation in unreadConversations.prefix(10) {
                guard !Task.isCancelled else { break }
                await ConversationSyncEngine.shared.ensureMessages(for: conversation.id)
            }
        }
        activePrefetchTask = prefetchTask

        task.expirationHandler = {
            prefetchTask.cancel()
        }

        await prefetchTask.value
        activePrefetchTask = nil
        task.setTaskCompleted(success: !prefetchTask.isCancelled)
        logger.info("Background message prefetch completed")
    }
}
