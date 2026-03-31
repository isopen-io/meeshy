import BackgroundTasks
import MeeshySDK
import os

private let logger = Logger(subsystem: "me.meeshy.app", category: "background")

@MainActor
final class BackgroundTaskManager {
    static let shared = BackgroundTaskManager()

    static let conversationSyncTaskId = "me.meeshy.app.conversation-sync"
    static let messagePrefetchTaskId = "me.meeshy.app.message-prefetch"

    private init() {}

    func registerTasks() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.conversationSyncTaskId,
            using: nil
        ) { task in
            Task { @MainActor in
                await self.handleConversationSync(task: task as! BGAppRefreshTask)
            }
        }

        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.messagePrefetchTaskId,
            using: nil
        ) { task in
            Task { @MainActor in
                await self.handleMessagePrefetch(task: task as! BGProcessingTask)
            }
        }

        logger.info("Background tasks registered")
    }

    func scheduleConversationSync() {
        let request = BGAppRefreshTaskRequest(identifier: Self.conversationSyncTaskId)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)

        do {
            try BGTaskScheduler.shared.submit(request)
            logger.info("Conversation sync scheduled")
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
        scheduleConversationSync()

        let syncTask = Task {
            await ConversationSyncEngine.shared.syncSinceLastCheckpoint()
        }

        task.expirationHandler = {
            syncTask.cancel()
        }

        await syncTask.value
        task.setTaskCompleted(success: !syncTask.isCancelled)
        logger.info("Background conversation sync completed")
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

        task.expirationHandler = {
            prefetchTask.cancel()
        }

        await prefetchTask.value
        task.setTaskCompleted(success: !prefetchTask.isCancelled)
        logger.info("Background message prefetch completed")
    }
}
