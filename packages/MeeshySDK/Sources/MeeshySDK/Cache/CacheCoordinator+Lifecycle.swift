import Foundation
import Combine
import UIKit
#if canImport(BackgroundTasks)
import BackgroundTasks
#endif
import os

extension CacheCoordinator {
    // MARK: - Lifecycle

    func subscribeToLifecycle() {
        #if canImport(UIKit)
        let resign = NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task { await self.flushAll() }
        }

        // `willResignActive` fires for brief pre-backgrounding hand-offs
        // (control center, incoming call) but NOT reliably on full
        // background → terminate. We also observe `didEnterBackground`
        // explicitly so dirty cache keys reach disk before the OS freezes
        // the process, and `willTerminate` as the last-chance hook.
        let background = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task { await self.flushAll() }
        }

        let terminate = NotificationCenter.default.addObserver(
            forName: UIApplication.willTerminateNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            // Task 1.3 — terminate flush: instead of a `DispatchSemaphore.wait`
            // that could expire mid-write (semaphore times out before
            // `flushAll()` reaches disk, dirty keys are lost), submit a
            // `BGProcessingTask` so the OS can complete the work after the
            // process is suspended, and fire a best-effort foreground flush
            // with a 4s deadline in parallel. Whichever path wins the race
            // persists the dirty set; the other becomes a no-op because
            // `flushDirtyKeys` is idempotent.
            #if canImport(BackgroundTasks)
            let request = BGProcessingTaskRequest(identifier: CacheBackgroundFlushTask.identifier)
            request.requiresNetworkConnectivity = false
            request.requiresExternalPower = false
            do {
                try BGTaskScheduler.shared.submit(request)
            } catch {
                Logger.cache.warning("Failed to submit background flush task: \(error.localizedDescription, privacy: .public)")
            }
            #endif
            guard let self else { return }
            Task { await self.flushAll(deadline: Date().addingTimeInterval(4)) }
        }

        let memory = NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task { await self.evictUnderMemoryPressure() }
        }
        lifecycleObservers = [resign, background, terminate, memory]
        #endif
    }

    /// cache-01 — LA liste des stores GRDB, en criticité décroissante (les
    /// premiers flushés si la deadline coupe). Toute divergence avec les
    /// propriétés déclarées en tête de classe est un bug.
    ///
    /// cache-09 (#7146) — elle n'ordonne plus seulement le flush : `reset()` et
    /// `invalidateAll()` la PARCOURENT au lieu de renommer chaque store. Les
    /// énumérations séparées ont laissé passer `phonebook` et `affiliates`
    /// quand `deleteAllL2()` a cessé de purger toutes les tables d'un coup, et
    /// le compte suivant héritait du carnet d'adresses du précédent. Un seul
    /// endroit à tenir, et `CacheCoordinatorPurgeInventoryTests` le confronte
    /// aux propriétés déclarées — un store oublié ici rougit sans qu'on ait
    /// pensé à lui. Visibilité interne pour ce témoin.
    var allGRDBStores: [any GRDBDirtyFlushing] {
        [
            conversations, messages, conversationMedia, notifications, feed, stories, participants, profiles,
            comments, statuses, communities, stats, profileStats, participantProfiles, engagementProgress, drafts,
            callTranscripts, callNetworkJournals, friends, friendRequests, blockedUsers, sessions, userSearch,
            phonebook, affiliates, callHistory, timeline,
            affiliateTokens, shareLinks, trackingLinks, communityLinks,
            categories, userTags, userPreferences, conversationPreferences
        ]
    }

    public func flushAll() async {
        await flushAll(deadline: nil)
    }

    /// Deadline-aware flush invoked by `CacheBackgroundFlushTask` and the
    /// `willTerminate` lifecycle hook (Task 1.3 of the iOS Local-First
    /// Wave 1 plan). Each store is asked to drain its dirty set, checking
    /// the deadline between keys so a long-running flush can abandon
    /// cleanly when the OS budget is about to run out. Stores not yet
    /// drained stay dirty — the next foreground hop or scheduled BG task
    /// picks them up. A `nil` deadline preserves the legacy unbounded
    /// behaviour used by `evictUnderMemoryPressure` and the foreground
    /// `BackgroundTransitionCoordinator` hook.
    ///
    /// Note: the GRDB writes are sequenced (one transaction per dirty key
    /// per store) rather than batched into a single global transaction.
    /// Option A in the plan — see the task notes for the trade-off.
    public func flushAll(deadline: Date?) async {
        // cache-01 — itère TOUS les stores (l'ancienne énumération n'en
        // couvrait que 6 : l'état « lu » des notifications se perdait au
        // kill). La persistance des traductions est incrémentale (cache-02).
        for store in allGRDBStores {
            if let deadline, Date() >= deadline { return }
            await store.flushDirtyKeys(deadline: deadline)
        }
    }

    public func evictUnderMemoryPressure() async {
        for store in allGRDBStores {
            await store.flushDirtyKeys()
        }
        for store in allGRDBStores {
            await store.evictL1()
        }

        await images.evictExpired()
        await audio.evictExpired()
        await video.evictExpired()
        await thumbnails.evictExpired()

        // cache-06 — le trio de traduction TEXTE est plafonné à 500 entrées
        // (quelques centaines de Ko) : le vider ici ne libère presque rien
        // face aux NSCache médias évincés ci-dessus, et force un aller ZMQ +
        // une passe NLLB par message au rendu suivant (bulles retombées sur
        // l'original — violation du Prisme). On le laisse chaud ; l'éviction
        // FIFO (evictTranslationCacheIfNeeded) reste le garde-fou de taille.
        transcriptionCache.removeAll()
        audioTranslationCache.removeAll()

        logger.info("Memory pressure — flushed dirty keys, evicted L1 caches and expired media")
    }
}
