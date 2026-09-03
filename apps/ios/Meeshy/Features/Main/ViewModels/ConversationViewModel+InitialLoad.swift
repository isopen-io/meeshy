import Foundation
import Combine
import UIKit
import GRDB
import MeeshySDK
import MeeshyUI
import os

// Extrait de `ConversationViewModel.swift` (#4942, D-MAINT-01), qui portait
// 4 832 lignes — quatre fois le plafond DUR de 1 200 de la directive
// 2026-09-02, que `FileSizeBudgetGuardTests` mesure et qui interdit d'AJOUTER
// à un fichier hors budget. Un chantier de fluidité qui doit toucher le
// chargement, l'envoi et l'observation du magasin ne pouvait pas commencer
// avant : on extrait d'abord, on ajoute ensuite. Le découpage suit une
// RESPONSABILITÉ, jamais une tranche de lignes, et ne change AUCUN
// comportement — les corps sont déplacés à l'identique.
//
// `private` est de portée FICHIER en Swift : les membres de l'hôte que cette
// extension consomme se sont élargis en interne par la découpe, pas par un
// choix de visibilité. Les propriétés STOCKÉES restent chez l'hôte — une
// extension ne peut pas en déclarer.
//
// Responsabilité tenue ici : FAIRE VENIR les messages — l'ouverture cache-first
// (`loadMessages`, GRDB peint d'abord, réseau ensuite), la revalidation REST,
// la pagination vers l'arrière, le rattrapage `after` d'une absence et
// l'hydratation des métadonnées audio depuis GRDB. La discipline d'ATOMICITÉ y
// est intacte : aucun `await` entre la pose des messages et celle de leurs
// transcriptions, sans quoi une image sortirait avec des bulles audio sans
// karaoké.

extension ConversationViewModel {

    // MARK: - Load Messages (initial)

    /// Ce qu'un `.task` REJOUÉ doit faire quand la fenêtre est déjà peinte :
    /// réarmer le fil temps réel, et rien d'autre.
    ///
    /// La garde d'idempotence (#4943) économise ce qui COÛTE — réconciliations,
    /// drain NSE, deux lectures GRDB, tour REST d'ouverture — mais elle sortait
    /// AVANT l'armement, qui ne coûte rien et porte tout : sans abonnements
    /// armés, une conversation ré-affichée sur un ViewModel conservé
    /// (re-présentation d'une destination, restauration de scène, onglet qui
    /// revient) n'aurait plus de fil vivant du tout, et plus AUCUN filet — ni
    /// socket, ni revalidation. L'appel est idempotent côté handler.
    ///
    /// La revalidation RÉSEAU reste hors de ce chemin PAR DÉCISION : le rejeu
    /// du tour REST d'ouverture était précisément la re-disposition que #4943
    /// supprime, et le rattrapage des deltas passe par le puits global
    /// `message:new` et par `syncMissedMessages()` à la reconnexion.
    private func armOnReopen() {
        socketHandler?.armSocketSubscriptions()
    }

    /// L'OUVERTURE — le seul point d'entrée du `.task` de la vue.
    ///
    /// Sans paramètre : le `force` qui vivait ici n'avait AUCUN appelant, et
    /// son doc-comment annonçait « la porte du rafraîchissement explicite »
    /// que le dépôt n'ouvrait nulle part. Une porte que personne ne peut
    /// pousser ne garde rien ; la faire exister se décide avec le geste qui la
    /// pousserait (tirer-pour-rafraîchir), pas avant.
    func loadMessages() async {
        guard !isLoadingInitial else { return }
        // IDEMPOTENCE de l'ouverture (#4943). Le `.task` d'une vue SwiftUI est
        // rejoué à chaque ré-apparition de l'écran (retour d'arrière-plan,
        // re-présentation d'une destination de navigation) : sans garde, tout
        // le chargement initial — réconciliations outbox, drain NSE, lecture de
        // cache, lecture de fenêtre, revalidation REST — repartait de zéro
        // alors que la liste était déjà peinte, et la re-disposait.
        //
        // La garde ne verrouille que le SUCCÈS : une ouverture qui n'a RIEN
        // donné (GRDB froid + réseau KO) reste rejouable au réveil suivant,
        // sans quoi une conversation ouverte hors ligne resterait vide jusqu'à
        // sa destruction.
        //
        // Le chemin court n'est pas un `return` NU : il RÉARME le fil
        // (`armOnReopen`). La garde vaut pour ce qui COÛTE, jamais pour ce qui
        // fait vivre le temps réel.
        guard !hasLoadedInitialMessages else {
            armOnReopen()
            return
        }
        isLoadingInitial = true
        error = nil

        // Les trois réconciliations qui précèdent la lecture, en PARALLÈLE
        // (#4943, D-OPEN-02). Elles doivent toutes précéder l'instantané —
        // sinon la fenêtre lue ne porterait ni les états rectifiés ni les
        // messages poussés pendant l'absence — mais AUCUNE ne lit ce qu'une
        // autre écrit : `consumeAll` n'insère que des lignes SERVEUR (avec
        // `serverId`, état `.sent`/`.delivered`), jamais une ligne
        // `.sending`/`.queued` sans `serverId` que la réconciliation des
        // orphelines devrait voir ; et les deux réconciliations filtrent des
        // ensembles disjoints (outbox `.exhausted` d'un côté, absence d'outbox
        // vivant de l'autre) vers le MÊME état terminal `.failed`, donc leur
        // ordre relatif est sans effet.
        //
        // Ce qui se recouvre RÉELLEMENT, dit sans l'embellir : les deux
        // premières branches sont deux méthodes du MÊME acteur, donc elles se
        // sérialisent sur son exécuteur — ce qui se recouvre est leur ATTENTE,
        // pas leur corps. La troisième, elle, quitte vraiment le fil principal
        // pour sa partie coûteuse (`readAndDecodePending`, en tâche détachée),
        // et ne revient sur le MainActor que pour l'upsert de cache et le
        // commit GRDB attendu. Le gain est celui des allers-retours, pas d'un
        // parallélisme de calcul — un commentaire qui sur-annonce empêche le
        // prochain de mesurer.
        //
        // 1. Les messages bloqués en .sending/.queued dont le record outbox est
        //    épuisé → .failed. Couvre le cas « conversation rouverte après
        //    épuisement des tentatives » : la bulle affiche alors la barre
        //    « Échec · Réessayer · Supprimer » au lieu d'un spinner figé.
        async let failedReconciled: Void =
            messagePersistence.reconcileFailedFromOutbox(conversationId: conversationId)
        // 2. Les lignes optimistes ORPHELINES (process tué / Task annulée
        //    entre l'insert optimiste et serverAck/sendFailed, AUCUN outbox
        //    vivant pour les rejouer) : sans ça l'horloge `.sending` réapparaît
        //    à chaque réouverture, pour toujours.
        async let orphansReconciled: Void =
            messagePersistence.reconcileOrphanedSendingRows(conversationId: conversationId)
        // 3. Drain any push-prefetched messages the NSE wrote to the App Group
        //    BEFORE reading the GRDB snapshot. A message received while the app
        //    was backgrounded (the "j'ai reçu la notif" case) is otherwise only
        //    merged on `resumeFromBackground`, never on the conversation-open
        //    path — so it stayed absent from the thread until a network refresh.
        //    `consumeAll` persists synchronously (awaited upsert), so the
        //    snapshot below picks the message up locally — no REST round-trip.
        async let nsePendingDrained: Void = NSEPendingMessageConsumer.shared.consumeAll()
        await failedReconciled
        await orphansReconciled
        await nsePendingDrained

        let cached = await CacheCoordinator.shared.messages.load(for: conversationId)
        switch cached {
        case .fresh:
            // Surface GRDB data immediately (fast path for returning to a conversation).
            // Pré-hydrate les traductions AVANT loadInitial : les bulles
            // s'affichent dès le premier rendu avec le Prisme Linguistique.
            // Overlap the two independent pre-paint GRDB reads instead of
            // awaiting them in series: persisted translations (must land before
            // `apply` so bubbles paint with the Prisme already applied — no
            // untranslated flash) and the message snapshot. They touch disjoint
            // state (the translations dict vs the message store) and are pure
            // reads on the WAL pool, so they run concurrently; awaiting BOTH
            // before `apply` keeps the exact ordering invariant while cutting the
            // sequential read latency when reopening a cached conversation.
            async let translationsHydrated: Void = hydratePersistedTranslations()
            // Atomic publish — read off-MainActor, then apply messages +
            // dependent metadata in a single MainActor slice so no
            // intermediate frame ever renders audio bubbles without their
            // transcription / translated audios dictionaries.
            let freshSnapshot = await messageStore.loadInitialSnapshot()
            await translationsHydrated
            // Merge the volatile (CacheCoordinator) translations for THESE exact
            // messages into the dict BEFORE apply. `hydratePersistedTranslations`
            // only pre-loads GRDB-persisted rows, so freshly-received translations
            // that haven't been persisted yet would otherwise land only in the
            // post-apply pass — popping the language flags in a frame AFTER the
            // bubbles paint. Hydrating here makes the first paint carry the flags.
            await hydrateTranslationsFromCache(messageIds: freshSnapshot.map(\.localId))
            messageStore.apply(records: freshSnapshot)
            hydrateMetadataFromGRDB(from: freshSnapshot)
            // Background revalidation — catches anything the local store missed
            // while the conversation was closed (edits, reactions, translations,
            // and any received message not already surfaced locally). The common
            // gaps are now closed before this snapshot: the global SyncEngine
            // sink (`handleNewMessage` → `apiMessagePersistor`) persists received
            // messages into GRDB even for CLOSED conversations while connected,
            // and `consumeAll()` above drains background-push messages from the
            // App Group synchronously — so the just-notified message renders from
            // local data on open, not after this round-trip. This refresh stays
            // unconditional as the authoritative backstop for the foreground race
            // (the sink's write still in flight) and offline-delivered deltas.
            isRevalidating = !messageStore.messages.isEmpty
            Task { [weak self] in
                guard let self else { return }
                await self.refreshMessagesFromAPI()
                await self.syncMissedMessagesOnOpen()
                await MainActor.run { self.isRevalidating = false }
            }

        case .stale, .expired, .empty:
            // vm-conv-expired-metadata-01 — .expired/.empty suivent le même
            // chemin que .stale : GRDB est TOUJOURS peint d'abord (messages +
            // traductions + métadonnées audio), le réseau revalide ensuite.
            // L'ancienne branche réseau-only laissait les bulles sans
            // transcription/traductions quand le fetch échouait (offline).
            // Surface GRDB data immediately, then revalidate in background.
            // Pré-hydrate les traductions AVANT loadInitial (cf. .fresh).
            // Lectures GRDB indépendantes parallélisées (cf. branche .fresh).
            async let translationsHydrated: Void = hydratePersistedTranslations()
            let staleSnapshot = await messageStore.loadInitialSnapshot()
            await translationsHydrated
            // Pre-apply volatile-cache merge (see .fresh) so the language flags
            // paint with the bubbles instead of a frame later.
            await hydrateTranslationsFromCache(messageIds: staleSnapshot.map(\.localId))
            messageStore.apply(records: staleSnapshot)
            hydrateMetadataFromGRDB(from: staleSnapshot)
            if messageStore.messages.isEmpty {
                // GRDB cold for this conversation — fetch synchronously to render now.
                await refreshMessagesFromAPI()
                await hydrateTranslationsFromCache()
            } else {
                isRevalidating = true
                Task { [weak self] in
                    guard let self else { return }
                    await self.refreshMessagesFromAPI()
                    await self.syncMissedMessagesOnOpen()
                    await MainActor.run { self.isRevalidating = false }
                }
            }

        }

        // If the refresh discovered we no longer have access, the View is
        // already dismissing via the `accessRevoked` observer — skip the
        // socket arming, mark-as-read calls, and media prefetch which would
        // all just fire 403s of their own.
        if accessRevoked {
            isLoadingInitial = false
            return
        }

        // Calculate first unread message position
        if initialUnreadCount > 0 && messages.count >= initialUnreadCount {
            let unreadStartIndex = messages.count - initialUnreadCount
            let candidate = messages[unreadStartIndex]
            if !candidate.isMe {
                firstUnreadMessageId = candidate.id
            }
        }

        // Arm socket subscriptions now that messages are loaded — deferred
        // from SocketHandler.init to avoid 10-16ms of synchronous Combine
        // subscription setup blocking the first render.
        socketHandler?.armSocketSubscriptions()

        // Ouvrir une conversation ne la marque PLUS lue : elle en marquait 200
        // quand 10 tenaient à l'écran. L'observateur de visibilité
        // (MessageListViewController) signale ce qui est réellement affiché.
        // La RÉCEPTION, elle, reste globale : un message récupéré EST livré.
        // @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
        markAsReceived()

        // Prefetch media for visible messages
        prefetchRecentMedia()

        // Ferme la porte de l'ouverture — mais seulement si elle a donné une
        // fenêtre. Cf. la garde en tête de méthode : un chargement stérile
        // reste rejouable.
        hasLoadedInitialMessages = !messageStore.messages.isEmpty
        isLoadingInitial = false
    }

    func refreshMessagesFromAPI() async {
        do {
            // Warm cache means: we already have at least one message hydrated
            // from GRDB AND a previous fetch has succeeded. In that case we
            // ask the gateway to omit `translations` from the payload — they
            // are already in `translation_cache` GRDB and the live socket
            // (`translationReceived`) catches up any deltas. Cold-start keeps
            // the default `true` so the first paint has every translation.
            let warmCache = hasCompletedInitialFetch && !messageStore.messages.isEmpty
            let response = try await messageService.list(
                conversationId: conversationId,
                offset: 0,
                limit: 30,
                includeReplies: true,
                includeTranslations: !warmCache,
                languages: nil
            )

            // Upsert authoritative server data into GRDB; the MessageStore observation
            // surfaces new/updated rows to `messages` automatically — no direct assignment.
            // `preferredLanguages` : le prisme ORDONNÉ du lecteur, par lequel la
            // CITATION gravée dans la ligne descend le Prisme (#4945). Vide, la
            // citation retomberait sur l'original alors que la traduction existe.
            try? await messagePersistence.upsertFromAPIMessages(
                response.data, preferredLanguages: preferredLanguages
            )
            hasCompletedInitialFetch = true
            // Extrait transcriptions/traductions AVANT que les messages ne
            // soient surface : `messageTranscriptions` est prêt au premier
            // rendu, la transcription audio ne « pop » plus en second temps.
            // `extractAttachmentTranscriptions` lit `response.data`
            // directement, il n'a pas besoin du store.
            extractAttachmentTranscriptions(from: response.data)
            extractTextTranslations(from: response.data)
            // Atomic publish — same pattern as .fresh / .stale in
            // loadMessages. upsertFromAPIMessages has persisted the API rows
            // into GRDB, so loadInitialSnapshot picks them up; apply them in
            // the same MainActor slice as a defensive hydrateMetadataFromGRDB
            // call so a background revalidation never re-introduces a pop-in.
            // `forceOverwrite: true` because this is the AUTHORITATIVE refresh:
            // a server-side re-transcription must propagate to the UI even if
            // the message already had a (stale) cached transcription.
            let refreshSnapshot = await messageStore.loadInitialSnapshot()
            messageStore.apply(records: refreshSnapshot)
            hydrateMetadataFromGRDB(from: refreshSnapshot, forceOverwrite: true)

            // Keep legacy CacheCoordinator in sync so other parts of the app
            // (ConversationList preview, unread badge) that still read from it remain correct.
            let freshMessages = await processAPIMessages(response.data)
            // Phase 2 — seed the local consumption store from the server-synced
            // per-user progress so the waveform tint / video progress bar reflect
            // cross-device consumption at a glance (MAX-merged with local).
            seedMediaConsumption(from: freshMessages)
            scheduleTranscriptionRetry(for: response.data)
            let snapshot = freshMessages
            await CacheCoordinator.shared.messages.mergeUpdate(for: conversationId) { cached in
                let snapshotIds = Set(snapshot.map(\.id))
                let fromCacheOnly = cached.filter { !snapshotIds.contains($0.id) }
                return (snapshot + fromCacheOnly).sorted { $0.createdAt < $1.createdAt }
            }
        } catch let error as MeeshyError {
            switch error {
            case .forbidden(let reason, _):
                // 403: still authenticated, but no longer authorised on
                // THIS resource (kicked, group dissolved, blocked, etc.).
                await handleAccessRevoked(reason: reason)
                return
            case .server(404, let message), .server(410, let message):
                // 404/410: the conversation no longer exists (deleted by
                // owner, expired share-link target, hard-purged on the
                // server side). Same effect as a revoked access from the
                // user's perspective — the cached messages can no longer
                // be displayed, and we must dismiss the view rather than
                // leave stale content on screen for a conversation that
                // is gone. Without this branch the catch-all would treat
                // it as transient and the user would see ghost messages.
                await handleAccessRevoked(
                    reason: message.isEmpty
                        ? String(localized: "conversation.error.gone", defaultValue: "Cette conversation n'existe plus")
                        : message
                )
                return
            default:
                // Other server / network / unknown errors are transient —
                // keep cached data on screen, user retries on reload.
                break
            }
        } catch {
            // Cancellation / unknown — keep cached data displayed.
        }
    }

    /// Per-conversation cache scrub run when the server returns 403 on a
    /// messages fetch. Wipes only this conversation's footprint — other
    /// conversations the user still has access to remain hot.
    func handleAccessRevoked(reason: String?) async {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        await CacheCoordinator.shared.conversations.invalidate(for: conversationId)
        await CacheCoordinator.shared.participants.invalidate(for: conversationId)

        // Wipe GRDB rows; the store observation fires with an empty result,
        // clearing `messages` through the single legitimate write site.
        try? await messagePersistence.deleteAll(conversationId: conversationId)

        error = reason ?? "Vous n'avez plus acces a cette conversation"
        accessRevoked = true
    }

    // MARK: - Load Older Messages (infinite scroll)

    func loadOlderMessages() async {
        // Defensive reset: isProgrammaticScroll can get stuck true when a
        // programmatic scroll is interrupted (e.g. view transition cancellation).
        // Since loadOlderMessages is only invoked by manual user scrolling,
        // it is always safe to clear the flag here.
        if isProgrammaticScroll { isProgrammaticScroll = false }

        guard hasOlderMessages, !isLoadingOlder, !isLoadingInitial else { return }
        guard let oldestMsg = messages.first else { return }
        let oldestId = oldestMsg.id
        let oldestCreatedAt = oldestMsg.createdAt

        // Debounce: ignore calls that arrive too soon after the last one
        let now = Date()
        guard now.timeIntervalSince(lastOlderPaginationTime) >= Self.paginationDebounceInterval else { return }
        lastOlderPaginationTime = now

        isLoadingOlder = true
        // Save anchor BEFORE prepend so the view can restore scroll position
        scrollAnchorId = oldestId

        let beforeValue = nextMessageCursor ?? oldestId

        // Cache-FIRST (bible I1 « Offline Graceful Degradation », retour
        // user 2026-08-18 « chargement lent ») : la fenêtre GRDB suivante se
        // sert IMMÉDIATEMENT quand elle existe — scroller vers le haut ne
        // doit JAMAIS attendre le réseau pour des rangées déjà sur disque.
        // Le REST part ensuite pour ÉTENDRE la fenêtre (pages jamais
        // téléchargées) ; `loadOlder(before:)` est idempotent pour une même
        // ancre, le double glissement est donc sans effet.
        let cacheServedFirst = await messageStore.loadOlder(before: oldestCreatedAt)
        if cacheServedFirst { prefetchRecentMedia() }

        do {
            // Direct REST + GRDB persistence path. We DO NOT route through
            // ConversationSyncEngine.fetchOlderMessages because it only writes
            // to the legacy CacheCoordinator. MessageStore reads MessageRecord
            // rows from GRDB, so going through the sync engine would leave the
            // GRDB window stuck on the initial load and latch
            // hasOlderMessages to false on the very first scroll trigger.
            let olderPageLimit = 50
            let response = try await messageService.listBefore(
                conversationId: conversationId,
                before: beforeValue,
                limit: olderPageLimit,
                includeReplies: true,
                includeTranslations: true
            )

            // GRDB write and legacy CacheCoordinator processing are
            // independent — race them so the slower path (network-bound
            // GRDB on a background actor) doesn't gate the legacy cache
            // coherence path that the unread badge / preview rely on.
            // Le prisme est LU sur le MainActor avant la tâche fille : c'est une
            // valeur (`[String]`, Sendable), pas un accès au modèle depuis
            // l'enfant. Cf. le doc-comment de `upsertFromAPIMessages`.
            let readerPrism = preferredLanguages
            async let persistTask: Void? = try? messagePersistence.upsertFromAPIMessages(
                response.data, preferredLanguages: readerPrism
            )
            async let olderProcessedTask = processAPIMessages(response.data)
            _ = await persistTask
            let olderProcessed = await olderProcessedTask

            extractAttachmentTranscriptions(from: response.data)
            extractTextTranslations(from: response.data)
            scheduleTranscriptionRetry(for: response.data)
            await CacheCoordinator.shared.messages.mergeUpdate(for: conversationId) { existing in
                let existingIds = Set(existing.map(\.id))
                let newOnly = olderProcessed.filter { !existingIds.contains($0.id) }
                return (newOnly + existing).sorted { $0.createdAt < $1.createdAt }
            }

            // Slide the GRDB window anchor backwards; store observation
            // surfaces the prepended older rows to `messages` automatically.
            let didLoad = await messageStore.loadOlder(before: oldestCreatedAt)
            if didLoad { prefetchRecentMedia() }

            // Server is the source of truth for pagination state. Fallback :
            // les gateways antérieurs au fix de schéma Fastify strippaient
            // `cursorPagination` de la réponse — `?? false` verrouillait alors
            // la pagination après une seule page. Une page pleine (>= limit,
            // le mode cursor pouvait renvoyer limit+1) implique une suite.
            nextMessageCursor = response.cursorPagination?.nextCursor
            hasOlderMessages = response.cursorPagination?.hasMore
                ?? (response.data.count >= olderPageLimit)
        } catch {
            // Transient failure — keep hasOlderMessages so the next scroll
            // retries. Debounce prevents tight retry loops. La page GRDB a
            // DÉJÀ été servie avant le réseau (cache-first ci-dessus) — rien
            // à re-servir ici.
            Logger.messages.error("loadOlderMessages failed: \(error.localizedDescription)")
        }

        isLoadingOlder = false

        // Anticipatory prefetch: if the server has more pages AND the user
        // is still scrolled away from the bottom (likely scrolling fast),
        // immediately kick off the NEXT page in the background so it's
        // ready by the time the scroll reaches the new edge. This eliminates
        // the "hit the wall and wait" stutter on fast scrolls.
        if hasOlderMessages, !isCurrentlyNearBottom {
            Task { [weak self] in
                // Small delay to let the current batch render and the
                // scroll position stabilize before we start the next fetch.
                try? await Task.sleep(for: .milliseconds(150))
                guard let self, !self.isLoadingOlder else { return }
                await self.loadOlderMessages()
            }
        }
    }

    // MARK: - Ouverture de conversation

    /// Le rattrapage `after`, joué à l'OUVERTURE quand GRDB était déjà chaud.
    ///
    /// `refreshMessagesFromAPI()` lit `offset: 0, limit: 30` : sur une absence
    /// courte il suffit, mais au-delà de trente messages manqués il colle les
    /// trente derniers sur le bloc GRDB ancien et laisse un TROU au milieu que
    /// personne ne regarde — `loadOlderMessages` part du plus ancien vers
    /// l'arrière, ce rattrapage part du plus récent vers l'avant. Le trou
    /// n'était comblé que par redondance (le puits `message:new` global et le
    /// rejeu serveur de 48 h), jamais DÉTECTÉ, et rien ne le couvrait après une
    /// absence plus longue.
    ///
    /// Les deux lectures sont COMPLÉMENTAIRES, pas redondantes : le refresh
    /// rapporte les éditions et réactions des trente derniers, le rattrapage
    /// rapporte les messages ABSENTS, quel qu'en soit le nombre.
    ///
    /// Sur un GRDB FROID on ne l'appelle pas : le refresh vient d'apporter les
    /// trente plus récents, il n'y a rien devant eux à rattraper.
    private func syncMissedMessagesOnOpen() async {
        guard !messageStore.messages.isEmpty else { return }
        await syncMissedMessages()
    }

    // MARK: - Reconnection Sync (called by ConversationSocketHandler)

    func syncMissedMessages() async {
        // The high-water mark is the newest SERVER-TIMESTAMPED message we already
        // hold. Optimistic own-sends still in flight carry a LOCAL device-clock
        // `createdAt`; if the clock runs ahead of the server they would poison the
        // watermark and the gateway's strict `createdAt > after` (server time)
        // would silently skip real missed messages. `SyncWatermark.newest` (SDK
        // rule) excludes them. With no server-timestamped message there is nothing
        // to backfill *from* — a full load happens on conversation open instead,
        // so no-op rather than refetch from the top.
        guard let newestLocal = SyncWatermark.newest(among: messages) else { return }

        // Page size and total cap mirror the contiguous-backfill contract: a
        // missed-message gap of any size is filled by paging forward, not just
        // the most recent `limit` messages (the bug in the old offset:0 fetch,
        // which could never recover a gap larger than one page).
        let pageSize = 100
        let maxTotal = 1000

        // Back the watermark off by a sub-millisecond so a missed message that
        // shares the newest local message's exact instant is not excluded by
        // the gateway's strict `createdAt > after`; the boundary message simply
        // re-surfaces and is deduped by id on merge.
        var cursor = newestLocal.addingTimeInterval(-0.001)
        var collected: [APIMessage] = []

        do {
            while collected.count < maxTotal {
                let response = try await messageService.listAfter(
                    conversationId: conversationId, after: cursor, limit: pageSize,
                    includeReplies: true, includeTranslations: true, languages: nil
                )
                let page = response.data  // ascending (oldest-after-watermark first), per gateway contract
                guard !page.isEmpty else { break }

                collected.append(contentsOf: page)

                // Advance the watermark to the newest instant in this page.
                guard let pageNewest = page.compactMap(\.createdAt).max() else { break }
                cursor = pageNewest

                if page.count < pageSize { break }  // last (partial) page → gap filled
            }

            guard !collected.isEmpty else { return }

            // Upsert backfilled messages to GRDB; store observation surfaces them automatically.
            try? await messagePersistence.upsertFromAPIMessages(
                collected, preferredLanguages: preferredLanguages
            )
            extractAttachmentTranscriptions(from: collected)
            extractTextTranslations(from: collected)

            let userId = currentUserId
            let username = currentUsername
            let readerPrism = preferredLanguages
            // `listAfter` already returns ascending — no reversal needed (unlike the old DESC `list`).
            // Map off the main actor (see processAPIMessages) — `toMessage` decode is CPU-bound.
            let fetchedMessages = await Task.detached(priority: .utility) {
                collected.map {
                    $0.toMessage(
                        currentUserId: userId, currentUsername: username,
                        preferredLanguages: readerPrism
                    )
                }
            }.value
            let newMessages = fetchedMessages.filter { !self.containsMessage(id: $0.id) }

            if !newMessages.isEmpty {
                let convId = conversationId
                let snapshot = fetchedMessages
                Task.detached(priority: .utility) {
                    await CacheCoordinator.shared.messages.mergeUpdate(for: convId) { cached in
                        let cachedIds = Set(cached.map(\.id))
                        let newOnly = snapshot.filter { !cachedIds.contains($0.id) }
                        guard !newOnly.isEmpty else { return cached }
                        return (cached + newOnly).sorted { $0.createdAt < $1.createdAt }
                    }
                }
                Logger.socket.info("Backfilled \(newMessages.count) missed message(s) via watermark for conversation \(self.conversationId)")
            }
        } catch {
            Logger.socket.error("Failed to sync missed messages: \(error)")
        }
    }

    /// `message:restored-for-me` — un message que ce lecteur avait masqué pour
    /// lui-même redevient visible, depuis un autre de ses appareils.
    ///
    /// **Pourquoi une relecture serveur et pas une écriture locale.** Le
    /// masquage a purgé la ligne de GRDB (`purgeMessages`) : le contenu n'est
    /// plus ici, et l'événement n'en porte pas. Il ne reste qu'une adresse.
    ///
    /// **Pourquoi `listAround` et pas `listAfter`.** Le message rendu est
    /// presque toujours ANTÉRIEUR au dernier message détenu — il a été masqué
    /// quelque part dans l'historique. Une fenêtre centrée sur lui le ramène
    /// avec ses voisins ; un backfill par watermark ne le verrait jamais.
    ///
    /// **Pourquoi aucun `loadWindow`.** Le geste vient d'un AUTRE appareil : il
    /// ne doit pas déplacer le regard de celui-ci. L'upsert suffit — chaque
    /// écriture de `MessagePersistenceActor` poste `.messageStoreShouldRefresh`,
    /// et le store relit sa fenêtre courante. Si le message rendu y tombe, la
    /// bulle réapparaît à sa place chronologique ; sinon il attend en cache que
    /// le lecteur remonte jusqu'à lui, sans qu'aucun aller-retour de plus soit
    /// nécessaire.
    ///
    /// Chaque adresse est traitée indépendamment : une relecture qui échoue
    /// (message devenu inaccessible, réseau) ne doit pas emporter ses voisines.
    ///
    /// La route unitaire (`restoreMessageForUser`) n'émet aujourd'hui qu'UNE
    /// adresse par événement, mais le gabarit est une liste — comme pour le
    /// masquage, dont la route en lot en accepte cent. `listAround` ramenant
    /// une FENÊTRE et non un message isolé, une adresse déjà couverte par une
    /// fenêtre précédente n'a rien à redemander : le lot se replie de lui-même
    /// sur le nombre de fenêtres réellement distinctes, au lieu de facturer un
    /// aller-retour par id si une restauration en lot voit le jour.
    func restoreMessagesForMe(ids: [String]) async {
        var covered: Set<String> = []

        for messageId in ids where !covered.contains(messageId) {
            do {
                let response = try await messageService.listAround(
                    conversationId: conversationId, around: messageId, limit: limit,
                    includeReplies: true, includeTranslations: true, languages: nil
                )
                guard !response.data.isEmpty else { continue }

                try? await messagePersistence.upsertFromAPIMessages(
                    response.data, preferredLanguages: preferredLanguages
                )
                extractAttachmentTranscriptions(from: response.data)
                extractTextTranslations(from: response.data)
                covered.formUnion(response.data.map(\.id))
            } catch {
                Logger.socket.error(
                    "Failed to restore hidden message \(messageId): \(error.localizedDescription)"
                )
            }
        }
    }

    // MARK: - Hydrate metadata from GRDB (instant load)

    /// Reads the embedded transcription/translation metadata from GRDB's
    /// `attachmentsJson` blobs and populates `messageTranscriptions` and
    /// `messageTranslatedAudios` dictionaries **before** any REST call.
    /// This ensures that audio bubbles show transcriptions and language
    /// buttons on the very first render frame.
    ///
    /// - Parameters:
    ///   - records: explicit record list to read from. When nil, falls
    ///     back to `messageStore.messages` (legacy path). Pass an
    ///     explicit list to ensure atomicity with a same-runloop `apply`.
    ///   - forceOverwrite: when `true`, replaces existing entries in
    ///     `messageTranscriptions` / `messageTranslatedAudios`. Default
    ///     `false` preserves any in-memory state already written by a
    ///     concurrent socket delta (`applyAttachmentUpdate`). Pass
    ///     `true` from `refreshMessagesFromAPI` so a server-side
    ///     re-transcription propagates to the UI even when the message
    ///     already had a (stale) transcription cached.
    func hydrateMetadataFromGRDB(
        from records: [MessageRecord]? = nil,
        forceOverwrite: Bool = false
    ) {
        let decoder = JSONDecoder()
        let source = records ?? messageStore.messages
        for record in source {
            let msgId = record.serverId ?? record.localId
            guard let data = record.attachmentsJson,
                  let attachments = try? decoder.decode([MeeshyMessageAttachment].self, from: data)
            else { continue }

            for att in attachments {
                // Hydrate transcription
                if let t = att.transcription {
                    let segments = (t.segments ?? []).map {
                        MessageTranscriptionSegment(
                            text: $0.text,
                            startTime: $0.startTime,
                            endTime: $0.endTime,
                            speakerId: $0.speakerId
                        )
                    }
                    let transcription = MessageTranscription(
                        attachmentId: att.id,
                        text: t.text,
                        language: t.language,
                        confidence: t.confidence,
                        durationMs: t.durationMs,
                        segments: segments,
                        speakerCount: t.speakerCount
                    )
                    if forceOverwrite || messageTranscriptions[msgId] == nil {
                        messageTranscriptions[msgId] = transcription
                    }
                    if forceOverwrite || messageTranscriptionsByAttachment[att.id] == nil {
                        messageTranscriptionsByAttachment[att.id] = transcription
                    }
                }

                // Hydrate audio translations
                if let translations = att.audioTranslations, !translations.isEmpty {
                    var audios: [MessageTranslatedAudio] = []
                    for (lang, trans) in translations {
                        let segments = (trans.segments ?? []).map {
                            MessageTranscriptionSegment(
                                text: $0.text,
                                startTime: $0.startTime,
                                endTime: $0.endTime,
                                speakerId: $0.speakerId
                            )
                        }
                        audios.append(MessageTranslatedAudio(
                            id: "\(att.id)_\(lang)",
                            attachmentId: att.id,
                            targetLanguage: lang,
                            url: trans.url,
                            transcription: trans.transcription ?? "",
                            durationMs: trans.durationMs ?? 0,
                            format: trans.format ?? "mp3",
                            cloned: trans.cloned ?? false,
                            quality: trans.quality ?? 0,
                            voiceModelId: trans.voiceModelId,
                            ttsModel: trans.ttsModel ?? "xtts",
                            segments: segments
                        ))
                    }
                    if !audios.isEmpty {
                        if forceOverwrite || messageTranslatedAudios[msgId] == nil {
                            messageTranslatedAudios[msgId] = audios
                        }
                        if forceOverwrite || messageTranslatedAudiosByAttachment[att.id] == nil {
                            messageTranslatedAudiosByAttachment[att.id] = audios
                        }
                    }
                }
            }
        }
    }
}
