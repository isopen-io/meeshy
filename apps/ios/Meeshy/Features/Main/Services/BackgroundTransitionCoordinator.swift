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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
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
        // grdb-05 — dernier step, le plus sacrifiable si l'OS expire le
        // budget. DOIT rester sous CETTE garde beginBackgroundTask :
        // incremental_vacuum tient un verrou d'écriture sur le fichier SQLite
        // App Group partagé avec la NSE — un verrou encore tenu à la
        // suspension est le motif documenté du kill 0xdead10cc.
        await withBudget("db.maintenance") {
            let pool = DependencyContainer.shared.dbPool
            do {
                try DatabaseMaintenance.runIncrementalVacuum(on: pool)
                try DatabaseMaintenance.runOptimize(on: pool)
            } catch {
                logger.error("Background DB maintenance failed: \(error.localizedDescription, privacy: .public)")
            }
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
        // Partages que l'extension n'a pas pu envoyer (hors-ligne, jeton
        // périmé) : ils rejoignent l'outbox, qui les rejouera. Republier
        // l'environnement au passage garde l'extension alignée si l'utilisateur
        // a changé de gateway pendant la session.
        await withBudget("share.consumePendingSends") {
            WidgetDataManager.shared.publishAPIBaseURL()
            await SharePendingSendConsumer.shared.consumeAll()
            // #5056 — même réveil, même raison : la fiche de composition
            // déposée par l'extension arrive par le disque, pas par
            // l'ouverture, qui n'est qu'un raccourci faillible.
            await ShareComposeHandoffConsumer.shared.consumeNext()
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
        await withBudget("audio.resume") {
            await MediaLifecycleBridge.shared.resumeFromBackground()
        }
        await withBudget("sync.conversations") {
            await ConversationSyncEngine.shared.syncSinceLastCheckpoint()
        }
        await withBudget("conversationStore.flushOutbox") {
            await ConversationStore.shared.flushOutbox()
        }
        await withBudget("push.retryPending") {
            await PushDeliveryReceiptService.shared.flushPending()
            // PendingStatusQueue is also flushed on socket reconnect via
            // ConversationSocketHandler.triggerSyncIfNeeded(), but that observer
            // only exists while a conversation is open. Flush here to cover the
            // case where the user returns to the foreground on the list screen.
            await PendingStatusQueue.shared.flush()
        }
        await withBudget("outbox.recovery") {
            // Récupère les records orphelins laissés en `.inflight` si le
            // process a été tué pendant un dispatch. `bootRecovery()` ne
            // tournait qu'au cold start : un retour de background « warm »
            // (sans relance du process) laissait l'orphelin compté par
            // `pendingCount` — bannière « Synchronisation… » bloquée — mais
            // jamais repris par `flush()` qui ne SELECT que les `.pending`.
            // On le remet donc `.pending` ici aussi, avant le flush.
            do {
                _ = try await OfflineQueue.shared.bootRecovery()
            } catch {
                // Les lignes bloquées ne sont pas réarmées : elles le seront au
                // prochain passage au premier plan.
                Logger.backgroundTransition.error("Boot recovery failed on background transition: \(error.localizedDescription, privacy: .public)")
            }
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
            // Engagement rows are durable (SQLite) and retried by
            // EngagementRetryScheduler + the network-reconnect observer, so this
            // flush is NON-critical. Bound it: a slow network (serial dispatch +
            // 429 retries, observed 15-35s) must never hold the background-task
            // budget hostage and trip the 0x8BADF00D watchdog.
            let completed = await Self.runBounded(seconds: Self.engagementFlushBudget) {
                await EngagementFlushTrigger.flushNow()
            }
            if !completed {
                logger.info("Step engagement.flush exceeded \(Self.engagementFlushBudget, privacy: .public)s budget — deferred to retry scheduler (durable)")
            }
        }
    }

    /// Max time the non-critical engagement flush may consume during a
    /// background transition before it is abandoned to the retry scheduler.
    private static let engagementFlushBudget: Double = 8

    /// Races `operation` against a `seconds` timeout. Returns `true` if it
    /// completed, `false` if it timed out — cancelling the still-running work so
    /// a bounded, durable step can never block the background-task budget.
    nonisolated static func runBounded(
        seconds: Double,
        _ operation: @escaping @Sendable () async -> Void
    ) async -> Bool {
        await withTaskGroup(of: Bool.self) { group in
            group.addTask { await operation(); return true }
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                return false
            }
            let finishedFirst = await group.next() ?? false
            group.cancelAll()
            return finishedFirst
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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = MediaLifecycleBridge()
    private init() {}

    func prepareForBackground() async {
        let video = SharedAVPlayerManager.shared
        // L'auto-PiP système démarre PENDANT la transition — ce garde court
        // contre son animation. Quand une surface a opté pour le PiP
        // (`isPipConfigured`, jamais vrai sur simulateur), on lui laisse une
        // fenêtre bornée pour s'engager avant de trancher, sinon un `pause()`
        // prématuré avorterait la fenêtre que le système ouvrait.
        var pipEngaged = video.isPipEngaged
        if video.isPlaying, !pipEngaged, video.isPipConfigured {
            pipEngaged = await video.waitForPipEngagement(timeout: 0.4)
        }
        let decision = MediaBackgroundPolicy.decide(
            audioQueuePlaying: ConversationAudioCoordinator.sharedForTesting.isPlaying,
            audioQueueActive: ConversationAudioCoordinator.sharedForTesting.activeContext != nil,
            anyAudioEnginePlaying: PlaybackCoordinator.shared.isAnyAudioPlaying,
            videoPlaying: video.isPlaying,
            pipEngaged: pipEngaged
        )
        // Une vidéo (réel) hors PiP ne survit jamais à l'arrière-plan : le
        // mode background "audio" couvre les messages vocaux et posts audio,
        // pas la bande-son d'un réel. `pause()` (pas `stop()`) : ne touche pas
        // à la session AVAudioSession qu'une file audio en pause peut encore
        // tenir, et le retour en avant-plan retrouve la frame figée. Si
        // l'auto-PiP a engagé la fenêtre pendant la transition, la vidéo lui
        // appartient et continue.
        if decision.pausesVideo {
            video.pause()
        }
        if decision.keepsSessionAlive {
            // Audio en lecture OU file en pause OU PiP -> on ne coupe rien.
            // UIBackgroundModes "audio" couvre la lecture ; une file en PAUSE
            // garde sa session active pour rester l'app Now Playing : la carte
            // lock screen survit et son bouton play réveille l'app (parité
            // WhatsApp).
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

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let backgroundTransition = Logger(subsystem: "me.meeshy.app", category: "background-transition")
}
