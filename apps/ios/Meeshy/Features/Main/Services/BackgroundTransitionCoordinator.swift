import Combine
import UIKit
import MeeshySDK
import MeeshyUI
import os

private let logger = MeeshyLog.logger(.backgroundTransition)

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
    /// `enterBackground` court sur plusieurs attentes (cache, accusés de push par le réseau). Revenue au
    /// premier plan avant sa fin, l'app ne doit perdre ni ses sockets ni sa base ; REPARTIE en arrière-plan
    /// avant sa fin, elle doit les suspendre quand même — c'est le registre qui le dit, pas une génération.
    private var ledger = BackgroundTransitionLedger()

    private init() {}

    // MARK: - Background entry

    func enterBackground() async {
        // Une transition déjà en cours reprend à son compte ce nouveau départ : le registre la marque
        // « en arrière-plan », et elle suspendra sockets et base à sa fin — tout sauf l'étape média.
        guard ledger.enterBackground() == .start else {
            await joinRunningTransition()
            return
        }
        defer { ledger.finishTransition() }
        var socketsSuspended = false

        let taskId = UIApplication.shared.beginBackgroundTask(withName: "meeshy.background.transition") { [weak self] in
            // #7059 — L'OS ANNONCE LA SUSPENSION : c'est exactement l'instant du
            // 0xDEAD10CC. La base se ferme aux verrous ICI, de façon SYNCHRONE
            // et depuis le fil qui nous appelle — un `Task { }` ne garantit pas
            // de s'exécuter avant que le processus ne soit gelé, et ce qui roule
            // encore sur `DatabasePool.writer` tiendrait son verrou pendant le
            // gel. `suspend()` ne fait que poster une notification : aucun
            // besoin du main actor, aucune attente.
            DatabaseSuspension.suspend()
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
            if CallManagerHost.shared.isCallActiveForAudioGuard {
                logger.info("Skipping socket suspend — call active (keep signaling channel)")
            } else if !ledger.shouldSuspend {
                logger.info("Skipping socket suspend — app resumed during the transition")
            } else {
                MessageSocketManager.shared.prepareForBackground()
                SocialSocketManager.shared.prepareForBackground()
                socketsSuspended = true
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

        // #7059 — DERNIER GESTE AVANT DE RENDRE LA GARDE, et l'ordre n'est pas
        // négociable : suspendre plus tôt ferait échouer les steps ci-dessus en
        // SQLITE_INTERRUPT, à commencer par `db.maintenance`. À partir d'ici,
        // plus personne ne prend de verrou sur le fichier — c'est ce qui manquait
        // aux cinq suppressions 0xDEAD10CC mesurées sur l'appareil du porteur,
        // toutes venues d'écrivains que la garde de maintenance ne couvrait pas.
        if ledger.shouldSuspend {
            // Repartie en arrière-plan après une reprise survenue pendant la transition : les sockets
            // n'avaient pas été coupés à leur step — ils le sont ici.
            if !socketsSuspended && !CallManagerHost.shared.isCallActiveForAudioGuard {
                MessageSocketManager.shared.prepareForBackground()
                SocialSocketManager.shared.prepareForBackground()
            }
            DatabaseSuspension.suspend()
        } else {
            logger.info("Skipping database suspend — app resumed during the transition")
        }

        endBackgroundTask()
    }

    /// Le second départ rejoint la transition en cours, sauf son étape MÉDIA : elle a tranché pour ce
    /// qui jouait AVANT la reprise, et une vidéo relancée depuis continuerait de jouer en arrière-plan,
    /// sans PiP ni pause (#11041). Elle se rejoue sous la garde `beginBackgroundTask` que la transition
    /// en cours tient encore.
    private func joinRunningTransition() async {
        logger.info("Background re-entry joined the running transition — media step replayed")
        await withBudget("audio.prepareForBackground.joined") {
            await MediaLifecycleBridge.shared.prepareForBackground()
        }
    }

    // MARK: - Foreground entry

    /// La reprise de qui n'a PAS de compte ouvert : un invité entré par lien, ou l'écran de connexion.
    ///
    /// `enterBackground` suspend la base et coupe les sockets pour tout le monde ; la reprise complète, elle,
    /// n'est appelée que sous un compte. Sans ce pendant, la base restait suspendue au retour — toute écriture
    /// refusée jusqu'au cycle suivant — pour l'invité revenu à sa conversation comme pour la personne partie
    /// lire son code de connexion dans une autre app. Le socket de l'invité, détruit lui aussi, n'était
    /// jamais reconstruit : aucun chemin de reconnexion n'existe sans jeton de compte.
    func resumeWithoutSession() {
        logger.info("Foreground resume (no account session)")
        ledger.resume()
        DatabaseSuspension.resume()
        guard !CallManagerHost.shared.isCallActiveForAudioGuard,
              let guestSession = APIClient.shared.anonymousSessionToken, !guestSession.isEmpty else { return }
        MessageSocketManager.shared.connectAnonymous(sessionToken: guestSession)
    }

    func resumeFromBackground() async {
        logger.info("Foreground resume starting")
        // Deux retours rapprochés lançaient deux reprises concurrentes (deux `forceReconnect`, deux
        // vidages de l'outbox) ; un départ pendant la reprise la laissait reconstruire les sockets et
        // écrire dans une base déjà suspendue. Chaque step vérifie désormais que SA reprise est la courante.
        let epoch = ledger.resume()
        // #7059 — PREMIER GESTE, avant tout ce qui écrit. Les consommateurs
        // ci-dessous gravent en base dès la première ligne ; les laisser tourner
        // sur une base encore suspendue échangerait le plantage contre une
        // application muette au réveil, ce qui se diagnostique bien plus mal.
        DatabaseSuspension.resume()
        await resumeStep(epoch, "nse.consumePending") {
            await NSEPendingMessageConsumer.shared.consumeAll()
        }
        await resumeStep(epoch, "nse.consumePendingPosts") {
            await NSEPendingPostConsumer.shared.consumeAll()
        }
        // Partages que l'extension n'a pas pu envoyer (hors-ligne, jeton
        // périmé) : ils rejoignent l'outbox, qui les rejouera. Republier
        // l'environnement au passage garde l'extension alignée si l'utilisateur
        // a changé de gateway pendant la session.
        await resumeStep(epoch, "share.consumePendingSends") {
            WidgetDataManager.shared.publishAPIBaseURL()
            await SharePendingSendConsumer.shared.consumeAll()
            // #5056 — même réveil, même raison : la fiche de composition
            // déposée par l'extension arrive par le disque, pas par
            // l'ouverture, qui n'est qu'un raccourci faillible.
            await ShareComposeHandoffConsumer.shared.consumeNext()
            ShareRelayConsumer.shared.consumeNext()
        }
        await resumeStep(epoch, "sockets.resume") {
            // CALL-FIX 2026-06-05 — if a call kept the sockets alive (see the
            // enterBackground guard), do NOT force-reconnect on resume: that would
            // tear down and rebuild the very socket carrying the live call's
            // signaling. Only reconnect when no call is active.
            if CallManagerHost.shared.isCallActiveForAudioGuard {
                logger.info("Skipping socket resume reconnect — call active (socket kept alive)")
            } else {
                MessageSocketManager.shared.resumeFromBackground()
                SocialSocketManager.shared.resumeFromBackground()
            }
        }
        await resumeStep(epoch, "audio.resume") {
            await MediaLifecycleBridge.shared.resumeFromBackground()
        }
        await resumeStep(epoch, "sync.conversations") {
            await ConversationSyncEngine.shared.syncSinceLastCheckpoint()
        }
        await resumeStep(epoch, "media.autosavePushed") {
            // #8358 — ce que les pushs ont synchronisé app suspendue rejoint l'album.
            await PushedMediaAutoSaveQueue.shared.drain()
        }
        await resumeStep(epoch, "conversationStore.flushOutbox") {
            await ConversationStore.shared.flushOutbox()
        }
        await resumeStep(epoch, "push.retryPending") {
            await PushDeliveryReceiptService.shared.flushPending()
            // PendingStatusQueue is also flushed on socket reconnect via
            // ConversationSocketHandler.triggerSyncIfNeeded(), but that observer
            // only exists while a conversation is open. Flush here to cover the
            // case where the user returns to the foreground on the list screen.
            await PendingStatusQueue.shared.flush()
        }
        await resumeStep(epoch, "outbox.recovery") {
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
        await resumeStep(epoch, "outbox.flush") {
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
        await resumeStep(epoch, "engagement.flush") {
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
                _ = await cancellableSleep(for: .seconds(seconds))
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

    /// Un step de reprise ne s'exécute que si sa reprise est encore la courante.
    private func resumeStep(_ epoch: UInt64, _ step: String, _ work: () async -> Void) async {
        guard ledger.isCurrentResume(epoch) else {
            logger.info("Step \(step, privacy: .public) skipped — resume superseded or app backgrounded")
            return
        }
        await withBudget(step, work)
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

/// Registre pur de la transition d'arrière-plan : une seule transition court à la fois, et c'est l'état
/// VOULU de l'app à sa fin — en arrière-plan ou revenue — qui décide de suspendre sockets et base.
///
/// Arrière-plan → premier plan → arrière-plan pendant que la première transition attend encore le
/// réseau : le second départ rejoint la transition en cours (`.joined`), qui suspend à sa fin. Avant ce
/// registre, il était avalé par une garde de ré-entrée, et la transition en cours, ayant vu la reprise,
/// sautait la suspension : l'app était gelée la base ouverte (0xDEAD10CC, #7059).
nonisolated struct BackgroundTransitionLedger: Equatable {
    enum Entry: Equatable { case start, joined }

    private(set) var isTransitioning = false
    private(set) var isBackgrounded = false
    /// Avance à chaque reprise ET à chaque départ : une reprise dont l'époque n'est plus la courante
    /// (une reprise plus récente l'a doublée, ou l'app est repartie en arrière-plan) s'arrête.
    private(set) var resumeEpoch: UInt64 = 0

    mutating func enterBackground() -> Entry {
        isBackgrounded = true
        resumeEpoch &+= 1
        guard !isTransitioning else { return .joined }
        isTransitioning = true
        return .start
    }

    mutating func finishTransition() { isTransitioning = false }

    @discardableResult
    mutating func resume() -> UInt64 {
        isBackgrounded = false
        resumeEpoch &+= 1
        return resumeEpoch
    }

    /// La reprise d'époque `epoch` peut-elle encore agir ?
    func isCurrentResume(_ epoch: UInt64) -> Bool { !isBackgrounded && epoch == resumeEpoch }

    var shouldSuspend: Bool { isBackgrounded }
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

    /// Filet de l'attente du PiP automatique (#11041). AVKit annonce la
    /// fenêtre par `willStart` d'ordinaire AVANT que la scène ne passe en
    /// `.background` : l'attente rend la main au premier signal (démarrage,
    /// ouverture ou échec) et ne dure que si aucun ne vient. Elle remplace
    /// les 0,4 s qui guettaient `isPictureInPictureActive`, levé seulement
    /// à la FIN de l'animation — la pause tombait au milieu et avortait la
    /// fenêtre. Une seconde de son au plus quand aucune fenêtre ne s'ouvre.
    static let pipHandOffWindow: TimeInterval = 1.0

    private var isPreparingForBackground = false
    private var pipFailureSubscription: AnyCancellable?

    func prepareForBackground() async {
        observePipStartFailures()
        isPreparingForBackground = true
        defer { isPreparingForBackground = false }
        let video = SharedAVPlayerManager.shared
        // L'auto-PiP système démarre PENDANT la transition. Quand une surface
        // a opté pour le PiP (`isPipConfigured`, jamais vrai sur simulateur)
        // et que la fenêtre ne s'est pas encore déclarée, on lui laisse une
        // fenêtre bornée avant de trancher.
        if video.isPlaying, video.isPipConfigured, !video.isPipStartingOrEngaged {
            _ = await video.waitForPipHandOff(timeout: Self.pipHandOffWindow)
        }
        await applyBackgroundDecision(pipFailed: video.hasPipFailedToStart)
    }

    func resumeFromBackground() async {
        // No-op for now — players re-activate their session on next play().
        // Kept as an extension point if we later want to resume downloads.
    }

    /// Repli : la fenêtre PiP échoue à s'ouvrir alors que l'app est déjà en
    /// arrière-plan — la vidéo n'a plus de lieu, elle s'arrête et la session
    /// se rend (la musique coupée par Meeshy reprend).
    private func observePipStartFailures() {
        guard pipFailureSubscription == nil else { return }
        pipFailureSubscription = SharedAVPlayerManager.shared.pipStartFailures
            .receive(on: DispatchQueue.main)
            .sink { _ in
                Task { @MainActor in await MediaLifecycleBridge.shared.handlePipStartFailure() }
            }
    }

    private func handlePipStartFailure() async {
        guard !isPreparingForBackground,
              UIApplication.shared.applicationState == .background else { return }
        await applyBackgroundDecision(pipFailed: true)
    }

    private func applyBackgroundDecision(pipFailed: Bool) async {
        let video = SharedAVPlayerManager.shared
        let videoVerdict = MediaBackgroundPolicy.backgroundVideo(
            videoPlaying: video.isPlaying,
            pipConfigured: video.isPipConfigured,
            pipStartingOrEngaged: video.isPipStartingOrEngaged,
            pipFailed: pipFailed
        )
        let decision = MediaBackgroundPolicy.decide(
            audioQueuePlaying: ConversationAudioCoordinator.sharedForTesting.isPlaying,
            audioQueueActive: ConversationAudioCoordinator.sharedForTesting.activeContext != nil,
            anyAudioEnginePlaying: PlaybackCoordinator.shared.isAnyAudioPlaying,
            video: videoVerdict
        )
        Logger.pip.info("background decision — playing=\(video.isPlaying, privacy: .public) configured=\(video.isPipConfigured, privacy: .public) possible=\(video.isPipPossible, privacy: .public) startingOrEngaged=\(video.isPipStartingOrEngaged, privacy: .public) failed=\(pipFailed, privacy: .public) → video=\(String(describing: videoVerdict), privacy: .public) keepsSession=\(decision.keepsSessionAlive, privacy: .public)")
        // `.handOffToPip` : la vidéo appartient à la fenêtre — ni pause, ni
        // `stopAll()` (qui démonterait le PiP), et la session reste active.
        // `.pause` : `pause()` (pas `stop()`) ne touche pas à la session
        // qu'une file audio en pause peut encore tenir, et le retour au
        // premier plan retrouve la frame figée.
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
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let backgroundTransition = MeeshyLog.logger(.backgroundTransition)
}
