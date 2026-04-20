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
        let request = BGAppRefreshTaskRequest(identifier: Self.conversationSyncTaskId)
        request.earliestBeginDate = Date(timeIntervalSinceNow: delay ?? Self.normalSyncInterval)

        do {
            try BGTaskScheduler.shared.submit(request)
            logger.info("Conversation sync scheduled in \(Int(delay ?? Self.normalSyncInterval))s")
        } catch {
            logger.error("Failed to schedule conversation sync: \(error.localizedDescription)")
        }
    }

    func scheduleMessagePrefetch() {
        let request = BGProcessingTaskRequest(identifier: Self.messagePrefetchTaskId)
        request.requiresNetworkConnectivity = true
        request.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)

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
