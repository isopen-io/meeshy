import SwiftUI
import Combine
import GRDB
import MeeshySDK
import MeeshyUI
import os

extension MeeshyApp {
    func runLaunchSequence() async {
        prepareProcess()
        await wireNotificationToasts()
        await bootCaches()
        let bootPool = dependencies.dbPool
        await bootOutbox(pool: bootPool)
        await wireSettingsReplay()
        sweepLegacyOutboxFiles()
        drainOutboxAtBoot(pool: bootPool)
        bootEngagementAndLiveActivities()
        await resolveStoredSession()
        if AuthManager.shared.isAuthenticated {
            await bootAuthenticatedSession()
        } else {
            handleGuestDeepLink(deepLinkRouter.pendingDeepLink)
        }
        await finishLaunch()
    }

    func prepareProcess() {
        ImageDownsamplingConfig.applyGlobal()
        KeychainManager.shared.migrateToAfterFirstUnlock()
        #if DEBUG
        VitrineStage.preparer()
        #endif
        MeeshyConfig.shared.restoreEnvironment()
        WidgetDataManager.shared.publishAPIBaseURL()
    }

    func wireNotificationToasts() async {
        NotificationToastManager.shared.conversationPresentationProvider = { conversationId in
            WidgetDataManager.shared.conversationToastPresentation(forId: conversationId)
        }
        NotificationToastManager.shared.hapticPlayer = {
            HapticFeedback.light()
        }
        NotificationToastManager.shared.deliveredBannerPurger = { ref in
            NotificationActionHandler.removeDeliveredBanners(forThreadOf: ref)
        }
        NotificationActionHandler.shared.observeRevocations(from: NotificationToastManager.shared.notificationWasDeleted.eraseToAnyPublisher())
        await NotificationActionHandler.sweepExpiredEphemeralBanners()
        NotificationActionHandler.shared.observeForegroundSweep()
    }

    func bootCaches() async {
        launchSplash.reach(.cache)
        await CacheAccountBinder.shared.bind(DependencyContainer.activeAccountStoreKey()).value
        await CacheCoordinator.shared.start()
        #if DEBUG
        await VitrineStage.remplirLesCaches()
        #endif
        _ = PresenceManager.shared
        _ = NetworkMonitor.shared
    }

    func bootOutbox(pool bootPool: DatabasePool) async {
        launchSplash.reach(.outbox)
        await OfflineQueue.shared.configure(pool: bootPool)
        Task { await SharePendingSendConsumer.shared.consumeAll() }
        Task { await ShareComposeHandoffConsumer.shared.consumeNext() }
        ShareRelayConsumer.shared.consumeNext()
        UserPreferencesManager.shared.onSettingsMutationEnqueued = {
            Task { await OutboxFlushTrigger.flushNow() }
        }
        Task.detached(priority: .background) {
            do {
                _ = try await OfflineQueue.shared.bootRecovery()
            } catch {
                Logger.messages.error("Boot recovery failed: \(error.localizedDescription, privacy: .public)")
            }
        }
        await OfflineQueue.shared.setRetrySend { @Sendable item in
            do {
                let request = SendMessageRequest(
                    content: item.content,
                    originalLanguage: item.originalLanguage,
                    replyToId: item.replyToId,
                    forwardedFromId: item.forwardedFromId,
                    forwardedFromConversationId: item.forwardedFromConversationId,
                    attachmentIds: item.attachmentIds,
                    clientMessageId: item.clientMessageId,
                    location: item.location
                )
                let response = try await MessageService.shared.send(
                    conversationId: item.conversationId, request: request
                )
                return response.id
            } catch {
                return nil
            }
        }
    }

    func wireSettingsReplay() async {
        launchSplash.reach(.settingsQueue)
        await SettingsActionQueue.shared.setFlushHandler { @Sendable action in
            do {
                let _: SimpleAPIResponse = try await APIClient.shared.replayPersistedRequest(
                    persistedPath: action.endpoint,
                    method: action.httpMethod,
                    body: action.payload
                )
                return true
            } catch MeeshyError.server(let code, _) where [400, 404, 413, 422].contains(code) {
                return true
            } catch MeeshyError.forbidden {
                return true
            } catch {
                return false
            }
        }
    }

    func sweepLegacyOutboxFiles() {
        let didDeleteLegacyKey = "meeshy.outbox.legacyFilesDeleted"
        if !UserDefaults.standard.bool(forKey: didDeleteLegacyKey) {
            Task.detached(priority: .background) {
                OfflineQueue.deleteLegacyFile()
                await MainActor.run {
                    UserDefaults.standard.set(true, forKey: didDeleteLegacyKey)
                }
            }
        }
    }

    func drainOutboxAtBoot(pool bootPool: DatabasePool) {
        Task.detached(priority: .background) {
            do {
                _ = try await OfflineQueue.shared.bootRecovery()
            } catch {
                Logger.messages.error("Boot recovery (outbox flusher path) failed: \(error.localizedDescription, privacy: .public) — retried on next foreground")
            }
            let flusher = OutboxFlusher(
                pool: bootPool,
                dispatcher: OutboxDispatcher(),
                onOutcome: { @Sendable outcome in
                    Task { await OfflineQueue.shared.publishOutcome(outcome) }
                },
                isNetworkReachable: { @Sendable in
                    await MainActor.run { NetworkConditionMonitor.shared.isOnline }
                }
            )
            let nextRetry = await flusher.flush()
            await OutboxRetryScheduler.shared.schedule(at: nextRetry)
            await OutboxRetryScheduler.shared.startObservingNetworkReconnect()
            await OutboxRetryScheduler.shared.startObservingMutationEnqueued()
            await OutboxRetryScheduler.shared.startObservingSocketReconnect()
        }
    }

    func bootEngagementAndLiveActivities() {
        Task { @MainActor in
            await EngagementOutbox.shared.bootSweep()
            await EngagementOutbox.shared.purge(olderThan: Date().addingTimeInterval(-7 * 86400), maxRows: 5000)
            await EngagementFlushTrigger.flushNow()
            EngagementRetryScheduler.shared.startObservingNetworkReconnect()
        }
        OutboxLiveActivityCoordinator.shared.start()
        LiveActivityCommandBinding.shared.install()
    }

    func resolveStoredSession() async {
        Task { await FriendshipCache.shared.hydrate() }
        launchSplash.reach(.session)
        await AuthManager.shared.checkExistingSession()
        hasCheckedSession = true
        UILanguageOverride.cache(from: AuthManager.shared.currentUser?.systemLanguage)
        UILanguageOverride.refreshNotificationLanguage()
    }

    func bootAuthenticatedSession() async {
        Task { await SessionManager.shared.migrateKeychainIfNeeded() }
        #if DEBUG
        await VitrineStage.remplir()
        VitrineStage.ouvrir(apres: launchSplash.$phase)
        #endif
        launchSplash.reach(.conversationList)
        ConversationListVMOwner.prewarm(userId: AuthManager.shared.currentUser?.id ?? "")
        _ = await CacheCoordinator.shared.conversations.load(for: "list")
        Task {
            await Self.runPushBootstrapSequence(
                voipRegister: { VoIPPushManager.shared.register() },
                requestPushPermission: requestPushPermissionIfNeeded
            )
            await NotificationToastManager.shared.refreshUnreadCount()
            await NotificationCoordinator.shared.syncNow()
        }
    }

    func finishLaunch() async {
        await launchSplash.markReady()
        surfacePendingCrashReports()
        let retentionPersistence = dependencies.messagePersistence
        Task.detached(priority: .background) {
            do {
                let count = try await retentionPersistence.purgeOldMessages()
                if count > 0 {
                    Logger(subsystem: "com.meeshy.app", category: "retention")
                        .info("Purged \(count) messages older than \(MessagePersistenceActor.defaultRetentionMonths) months")
                }
            } catch {
                Logger(subsystem: "com.meeshy.app", category: "retention")
                    .error("purgeOldMessages failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }
}
