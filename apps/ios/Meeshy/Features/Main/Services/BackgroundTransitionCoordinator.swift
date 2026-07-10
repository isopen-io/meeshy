import UIKit
import MeeshySDK
import MeeshyUI
import os

private let logger = Logger(subsystem: "me.meeshy.app", category: "background-transition")

/// Orchestrates the `.background` scene transition under a real
/// `beginBackgroundTask` umbrella so every step gets a bounded OS budget
/// and the task is always ended — even if a step throws or the OS expires
/// us early. A single entry point keeps the lifecycle readable and makes
/// crashes during the transition traceable.
@MainActor
protocol BackgroundTransitioning: AnyObject {
    func enterBackground() async
    func resumeFromBackground() async
}

/// Steps are split so they can be individually mocked in tests and so the
/// coordinator can cancel or degrade gracefully on OS expiration.
@MainActor
final class BackgroundTransitionCoordinator: BackgroundTransitioning {
    static let shared = BackgroundTransitionCoordinator()

    private var activeTaskId: UIBackgroundTaskIdentifier = .invalid
    private var isTransitioning = false

    private init() {}

    // MARK: - Background entry

    func enterBackground() async {
        guard !isTransitioning else { return }
        isTransitioning = true
        defer { isTransitioning = false }

        let taskId = UIApplication.shared.beginBackgroundTask(withName: "meeshy.background.transition") { [weak self] in
            // OS is telling us time is up. End the task from the main actor so
            // we don't leave it dangling and trigger the 0x8BADF00D watchdog.
            Task { @MainActor [weak self] in
                self?.endBackgroundTask()
            }
        }
        activeTaskId = taskId
        logger.info("Background transition started (task=\(taskId.rawValue, privacy: .public))")

        // Each step is awaited with its own tolerance. We log failures but
        // never rethrow — the transition MUST complete even if one subsystem
        // is sick. Order matters: stop players before suspending audio
        // session; flush cache before scheduling BG tasks that may read.
        await withBudget("audio.prepareForBackground") {
            await MediaLifecycleBridge.shared.prepareForBackground()
        }
        await withBudget("cache.flushAll") {
            await CacheCoordinator.shared.flushAll()
        }
        await withBudget("tusCheckpoints.purgeStale") {
            // Sweep TUS upload checkpoints whose backing server session
            // has likely been GC'd (>2 days idle). Keeps the table small
            // and prevents the resume path from chasing a 404 on the
            // first PATCH of a long-abandoned upload.
            await TusUploadCheckpointStore.shared.purgeStale()
        }
        await withBudget("push.flushPendingReceipts") {
            await PushDeliveryReceiptService.shared.flushPending()
        }
        await withBudget("sockets.prepareForBackground") {
            // CALL-FIX 2026-06-05 — NEVER tear down the realtime sockets while a
            // call is active. CallKit + UIBackgroundModes(voip/audio) keep the app
            // running in background during a call; suspending the socket here kills
            // the WebRTC signaling channel mid-call (gateway sees "client namespace
            // disconnect" ~seconds after initiate), the offer/answer/ICE exchange
            // never completes and the call gets stuck on "connecting" + leaves a
            // phantom. Keep the socket alive; Socket.IO auto-reconnect still covers
            // a genuine transport drop.
            if CallManager.shared.isCallActiveForAudioGuard {
                logger.info("Skipping socket suspend — call active (keep signaling channel)")
            } else {
                MessageSocketManager.shared.prepareForBackground()
                SocialSocketManager.shared.prepareForBackground()
            }
        }
        // BG tasks are only useful for authenticated users — scheduling them
        // for guests would burn quota and fail at execution time.
        if AuthManager.shared.authToken != nil {
            await withBudget("bgtasks.schedule") {
                BackgroundTaskManager.shared.scheduleConversationSync()
                BackgroundTaskManager.shared.scheduleMessagePrefetch()
            }
        }
        await withBudget("notifications.syncNow") {
            await NotificationCoordinator.shared.syncNow()
        }

        endBackgroundTask()
    }

    // MARK: - Foreground entry

    func resumeFromBackground() async {
        logger.info("Foreground resume starting")
        await withBudget("nse.consumePending") {
            await NSEPendingMessageConsumer.shared.consumeAll()
        }
        await withBudget("nse.consumePendingPosts") {
            await NSEPendingPostConsumer.shared.consumeAll()
        }
        await withBudget("sockets.resume") {
            // CALL-FIX 2026-06-05 — if a call kept the sockets alive (see the
            // enterBackground guard), do NOT force-reconnect on resume: that would
            // tear down and rebuild the very socket carrying the live call's
            // signaling. Only reconnect when no call is active.
            if CallManager.shared.isCallActiveForAudioGuard {
                logger.info("Skipping socket resume reconnect — call active (socket kept alive)")
            } else {
                MessageSocketManager.shared.resumeFromBackground()
                SocialSocketManager.shared.resumeFromBackground()
            }
        }
        // Sync presence dots with the gateway runtime state. We may have missed
        // `user:status` events while suspended, and `presence:snapshot` only
        // fires on the next socket auth — which can lag by a few seconds after
        // the resume. This REST refresh closes the gap so the conversation
        // list lights up correctly the instant the user looks at it.
        await withBudget("presence.refresh") {
            PresenceService.shared.refreshKnownUsers()
        }
        await withBudget("audio.resume") {
            await MediaLifecycleBridge.shared.resumeFromBackground()
        }
        await withBudget("sync.conversations") {
            await ConversationSyncEngine.shared.syncSinceLastCheckpoint()
        }
        await withBudget("push.retryPending") {
            await PushDeliveryReceiptService.shared.flushPending()
        }
        await withBudget("outbox.recovery") {
            // Récupère les records orphelins laissés en `.inflight` si le
            // process a été tué pendant un dispatch. `bootRecovery()` ne
            // tournait qu'au cold start : un retour de background « warm »
            // (sans relance du process) laissait l'orphelin compté par
            // `pendingCount` — bannière « Synchronisation… » bloquée — mais
            // jamais repris par `flush()` qui ne SELECT que les `.pending`.
            // On le remet donc `.pending` ici aussi, avant le flush.
            _ = try? await OfflineQueue.shared.bootRecovery()
        }
        await withBudget("outbox.flush") {
            let pool = DependencyContainer.shared.dbPool
            let flusher = OutboxFlusher(
                pool: pool,
                dispatcher: OutboxDispatcher(),
                onOutcome: { @Sendable outcome in
                    Task { await OfflineQueue.shared.publishOutcome(outcome) }
                },
                // BW1 — bandwidth gate (cf. MeeshyApp boot flusher).
                isNetworkReachable: { @Sendable in
                    await MainActor.run { NetworkConditionMonitor.shared.isOnline }
                }
            )
            let nextRetry = await flusher.flush()
            OutboxRetryScheduler.shared.schedule(at: nextRetry)
        }
        await withBudget("engagement.flush") {
            await EngagementFlushTrigger.flushNow()
        }
    }

    // MARK: - Private

    private func endBackgroundTask() {
        guard activeTaskId != .invalid else { return }
        let taskId = activeTaskId
        activeTaskId = .invalid
        UIApplication.shared.endBackgroundTask(taskId)
        logger.info("Background transition ended (task=\(taskId.rawValue, privacy: .public))")
    }

    private func withBudget(_ step: String, _ work: () async -> Void) async {
        let start = Date()
        await work()
        let elapsed = Date().timeIntervalSince(start)
        if elapsed > 1.0 {
            logger.info("Step \(step, privacy: .public) took \(elapsed, privacy: .public)s")
        }
    }
}

/// Thin bridge that lets the coordinator (app layer) reach into the SDK
/// without leaking the coordinator type into MeeshySDK. The bridge just
/// delegates to the managers owned by the app; the SDK hosts the pure
/// orchestration primitives, the app wires them together.
@MainActor
final class MediaLifecycleBridge {
    static let shared = MediaLifecycleBridge()
    private init() {}

    func prepareForBackground() async {
        if ConversationAudioCoordinator.sharedForTesting.isPlaying
            || PlaybackCoordinator.shared.isAnyPlaying {
            // Audio Meeshy en cours -> on ne coupe rien. UIBackgroundModes "audio"
            // autorise l'OS a continuer la lecture en background. On considere
            // TOUTE lecture active (coordinator conversation OU lecteur plein
            // ecran via son propre AudioPlaybackManager, OU video), pas seulement
            // celle pilotee par le coordinator de conversation.
            return
        }
        #if DEBUG
        PlaybackCoordinator.shared.testStopAllProbe?.stopAllCount += 1
        #endif
        PlaybackCoordinator.shared.stopAll()
        // `deactivateForBackground()` self-increments `deactivateCount` after its
        // `callActive` guard, so the probe counts only real deactivations. Pre-
        // counting here would double-count (and over-count when a call is active
        // and the guard skips the actual teardown). `stopAll()` does NOT self-count,
        // which is why its probe increment above stays external.
        await MediaSessionCoordinator.shared.deactivateForBackground()
    }

    func resumeFromBackground() async {
        // No-op for now — players re-activate their session on next play().
        // Kept as an extension point if we later want to resume downloads.
    }
}
