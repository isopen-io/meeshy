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

    /// Un `.task` REJOUÉ sur une fenêtre déjà peinte ne fait que réarmer le fil temps réel (#4943) :
    /// la garde d'idempotence économise ce qui COÛTE, jamais ce qui fait vivre le socket.
    private func armOnReopen() {
        socketHandler?.armSocketSubscriptions()
    }

    /// L'OUVERTURE — le seul point d'entrée du `.task` de la vue. Cache-first : GRDB peint d'abord,
    /// le réseau revalide ensuite. La garde ne verrouille que le SUCCÈS : une ouverture stérile
    /// (GRDB froid + réseau KO) reste rejouable.
    func loadMessages() async {
        guard !isLoadingInitial else { return }
        guard !hasLoadedInitialMessages else {
            armOnReopen()
            return
        }
        isLoadingInitial = true
        error = nil

        await historyLoader.reconcileBeforeOpening()
        let cacheWasFresh = await openingCacheIsFresh()
        await paintFromLocalStore()
        await revalidateOpening(cacheWasFresh: cacheWasFresh)

        // Accès retiré par la revalidation : la vue se ferme, ni socket, ni accusé, ni préchargement.
        guard !accessRevoked else {
            isLoadingInitial = false
            return
        }
        freezeFirstUnreadBoundary()
        socketHandler?.armSocketSubscriptions()
        // Ouvrir ne marque PLUS lue : l'observateur de visibilité signale ce qui est affiché.
        markAsReceived()
        prefetchRecentMedia()
        hasLoadedInitialMessages = !messageStore.messages.isEmpty
        isLoadingInitial = false
    }

    private func openingCacheIsFresh() async -> Bool {
        let cached = await CacheCoordinator.shared.messages.load(for: conversationId)
        guard case .fresh = cached else { return false }
        return true
    }

    /// Les traductions persistées et l'instantané se lisent en parallèle, et AUCUN `await` ne sépare
    /// la pose des messages de celle de leurs métadonnées : pas de bulle audio sans karaoké.
    private func paintFromLocalStore() async {
        async let translationsHydrated: Void = hydratePersistedTranslations()
        let snapshot = await messageStore.loadInitialSnapshot()
        await translationsHydrated
        await hydrateTranslationsFromCache(messageIds: snapshot.map(\.localId))
        messageStore.apply(records: snapshot)
        hydrateMetadataFromGRDB(from: snapshot)
    }

    private func revalidateOpening(cacheWasFresh: Bool) async {
        guard cacheWasFresh || !messageStore.messages.isEmpty else {
            await refreshMessagesFromAPI()
            await hydrateTranslationsFromCache()
            return
        }
        isRevalidating = !messageStore.messages.isEmpty
        let heldUpTo = openingWatermark()
        Task { [weak self] in
            guard let self else { return }
            let refreshReachedBackTo = await self.refreshMessagesFromAPI()
            await self.syncMissedMessagesOnOpen(heldUpTo: heldUpTo, refreshReachedBackTo: refreshReachedBackTo)
            self.isRevalidating = false
        }
    }

    /// La frontière du premier non-lu est la LOI partagée (`FirstUnreadBoundary.resolve`), lue sur
    /// `messageStore.domainMessages` (synchrone) et non sur `messages`, que la souscription au store ne
    /// pose qu'un tour de boucle plus tard. Le COMPTE annoncé est `initialUnreadCount`, le champ serveur
    /// de la ligne de liste ; `0` ferme le séparateur, y compris pour un invité sans curseur (#7525).
    private func freezeFirstUnreadBoundary() {
        guard initialUnreadCount > 0, let boundary = FirstUnreadBoundary.resolve(
            messages: messageStore.domainMessages(currentUserId: currentUserId).map {
                FirstUnreadCandidateMessage(id: $0.id, senderId: $0.senderId, createdAt: $0.createdAt)
            },
            lastReadMessageId: lastReadMessageId,
            lastReadAt: lastReadAt,
            lastReadMessageCreatedAt: lastReadMessageCreatedAt,
            joinedAt: memberJoinedAt,
            viewerId: currentUserId,
            unreadCountHint: initialUnreadCount
        ) else {
            firstUnreadMessageId = nil
            unreadSeparatorCount = 0
            return
        }
        firstUnreadMessageId = boundary.firstUnreadId
        unreadSeparatorCount = initialUnreadCount
    }

    /// Rend l'instant du PLUS ANCIEN message de la page servie — jusqu'où le rafraîchissement a
    /// remonté —, `nil` quand il n'a rien servi.
    @discardableResult
    func refreshMessagesFromAPI() async -> Date? {
        let warmCache = hasCompletedInitialFetch && !messageStore.messages.isEmpty
        switch await historyLoader.refreshLatest(warmCache: warmCache, readerPrism: preferredLanguages) {
        case .accessRevoked(let reason):
            await handleAccessRevoked(reason: reason)
            return nil
        case .unavailable:
            return nil
        case .page(let page):
            hasCompletedInitialFetch = true
            await absorbRefreshedPage(page)
            return page.map(\.createdAt).min()
        }
    }

    /// Transcriptions et traductions AVANT que les messages ne surfacent ; `forceOverwrite` car ce
    /// rafraîchissement fait autorité (une re-transcription serveur doit se propager).
    private func absorbRefreshedPage(_ page: [APIMessage]) async {
        extractAttachmentTranscriptions(from: page)
        extractTextTranslations(from: page)
        let refreshSnapshot = await messageStore.loadInitialSnapshot()
        messageStore.apply(records: refreshSnapshot)
        hydrateMetadataFromGRDB(from: refreshSnapshot, forceOverwrite: true)

        let freshMessages = await processAPIMessages(page)
        seedMediaConsumption(from: freshMessages)
        scheduleTranscriptionRetry(for: page)
        await historyLoader.mergeIntoMessageCache(freshMessages, placement: .authoritative)
    }

    /// Purge par conversation après un 403 : le reste du cache des autres conversations reste chaud.
    func handleAccessRevoked(reason: String?) async {
        await historyLoader.forgetConversation()
        error = reason ?? "Vous n'avez plus acces a cette conversation"
        accessRevoked = true
    }

    // MARK: - Load Older Messages (infinite scroll)

    func loadOlderMessages() async {
        await loadOlderMessages(anticipated: false)
    }

    /// `anticipated` : la page part d'elle-même derrière la précédente et n'en relance pas d'autre,
    /// sans quoi une remontée unique téléchargerait tout l'historique.
    func loadOlderMessages(anticipated: Bool) async {
        if isProgrammaticScroll { isProgrammaticScroll = false }
        guard hasOlderMessages, !isLoadingOlder, !isLoadingInitial else { return }
        guard let oldestMsg = messages.first else { return }
        let now = Date()
        guard now.timeIntervalSince(lastOlderPaginationTime) >= Self.paginationDebounceInterval else { return }
        lastOlderPaginationTime = now

        isLoadingOlder = true
        let cursor = nextMessageCursor ?? oldestMsg.id
        // Cache-first : la fenêtre GRDB suivante se sert AVANT le réseau, qui ne fait que l'étendre.
        if await messageStore.loadOlder(before: oldestMsg.createdAt) { prefetchRecentMedia() }
        await extendOlderWindow(before: cursor, anchor: oldestMsg.createdAt)
        isLoadingOlder = false

        guard !anticipated, hasOlderMessages, !isCurrentlyNearBottom else { return }
        Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(150))
            guard let self, !self.isLoadingOlder else { return }
            await self.loadOlderMessages(anticipated: true)
        }
    }

    private func extendOlderWindow(before cursor: String, anchor: Date) async {
        do {
            let page = try await historyLoader.fetchOlder(before: cursor)
            let readerPrism = preferredLanguages
            async let persisted: Void = historyLoader.persist(page.messages, readerPrism: readerPrism)
            async let processed = processAPIMessages(page.messages)
            _ = await persisted
            let olderProcessed = await processed

            extractAttachmentTranscriptions(from: page.messages)
            extractTextTranslations(from: page.messages)
            scheduleTranscriptionRetry(for: page.messages)
            await historyLoader.mergeIntoMessageCache(olderProcessed, placement: .older)
            if await messageStore.loadOlder(before: anchor) { prefetchRecentMedia() }
            nextMessageCursor = page.nextCursor
            hasOlderMessages = page.hasMore
        } catch {
            Logger.messages.error("loadOlderMessages failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Ouverture de conversation

    /// Le rattrapage `after` joué à l'OUVERTURE quand GRDB était chaud : au-delà de trente messages
    /// manqués, le refresh laisse un TROU que seul ce rattrapage comble, depuis le message détenu AVANT
    /// le refresh (#10572). Sur un GRDB froid il n'y a rien devant les trente plus récents.
    private func syncMissedMessagesOnOpen(heldUpTo: Date?, refreshReachedBackTo: Date?) async {
        guard !accessRevoked,
              let cursor = Self.openingGapCursor(heldUpTo: heldUpTo, refreshReachedBackTo: refreshReachedBackTo)
        else { return }
        await syncMissedMessages(after: cursor)
    }

    /// Le plus récent message SERVEUR détenu par la fenêtre peinte, lu dans `messageStore` (synchrone).
    private func openingWatermark() -> Date? {
        SyncWatermark.newest(among: messageStore.domainMessages(currentUserId: currentUserId))
    }

    nonisolated static func openingGapCursor(heldUpTo: Date?, refreshReachedBackTo: Date?) -> Date? {
        ConversationHistoryLoader.openingGapCursor(heldUpTo: heldUpTo, refreshReachedBackTo: refreshReachedBackTo)
    }

    // MARK: - Reconnection Sync (called by ConversationSocketHandler)

    func syncMissedMessages() async {
        // #10830 — un écran QUITTÉ ne rattrape plus : son modèle peut survivre à la navigation.
        guard ConversationCatchUpGate.shared.isPresent(self) else { return }
        // Le filigrane est le plus récent message horodaté par le SERVEUR (`SyncWatermark.newest`) : un
        // envoi optimiste à l'horloge locale en avance ferait sauter de vrais messages manqués.
        guard let newestLocal = SyncWatermark.newest(among: messages) else { return }
        await syncMissedMessages(after: newestLocal)
    }

    /// L'écran de cette conversation est quitté par navigation (#10830).
    func noteScreenLeft() {
        ConversationCatchUpGate.shared.depart(self)
    }

    /// Le rattrapage `after` à partir d'un curseur : la reconnexion part de ce qui est détenu maintenant,
    /// l'ouverture de ce qui l'était AVANT son refresh. Un rattrapage déjà en vol se rejoint (#10830).
    func syncMissedMessages(after newestLocal: Date) async {
        do {
            let collected = try await historyLoader.fetchMissed(after: newestLocal)
            guard !collected.isEmpty else { return }
            let readerPrism = preferredLanguages
            await historyLoader.persist(collected, readerPrism: readerPrism)
            extractAttachmentTranscriptions(from: collected)
            extractTextTranslations(from: collected)

            let userId = currentUserId
            let username = currentUsername
            let fetchedMessages = await Task.detached(priority: .utility) {
                collected.map {
                    $0.toMessage(currentUserId: userId, currentUsername: username, preferredLanguages: readerPrism)
                }
            }.value
            let newMessages = fetchedMessages.filter { !self.containsMessage(id: $0.id) }
            guard !newMessages.isEmpty else { return }

            let loader = historyLoader
            Task(priority: .utility) { await loader.mergeIntoMessageCache(fetchedMessages, placement: .newer) }
            Logger.socket.info("Backfilled \(newMessages.count) missed message(s) via watermark for conversation \(self.conversationId)")
        } catch {
            Logger.socket.error("Failed to sync missed messages: \(error)")
        }
    }

    /// `message:restored-for-me` — un message que ce lecteur avait masqué pour lui-même redevient visible
    /// depuis un autre appareil. Le masquage a purgé la ligne : le contenu se relit sur le serveur, par
    /// une fenêtre centrée (`listAround`) qui ramène aussi les voisins. Aucun `loadWindow` : le geste vient
    /// d'un AUTRE appareil et ne déplace pas le regard de celui-ci ; l'upsert suffit, le store relit sa fenêtre.
    func restoreMessagesForMe(ids: [String]) async {
        await messageStore.reveal(ids)
        let served = await historyLoader.restoreAround(ids: ids, limit: limit, readerPrism: preferredLanguages)
        extractAttachmentTranscriptions(from: served)
        extractTextTranslations(from: served)
    }

    // MARK: - Hydrate metadata from GRDB (instant load)

    /// Reads the embedded transcription/translation metadata from GRDB's
    /// `attachmentsJson` blobs and populates `messageTranscriptions` and
    /// `messageTranslatedAudios` dictionaries **before** any REST call.
    /// This ensures that audio bubbles show transcriptions and language
    /// buttons on the very first render frame.
    ///
    /// - Parameters:
    ///   - records: the snapshot to read from — pass the list applied in
    ///     the same runloop so hydration stays atomic with `apply`.
    ///   - forceOverwrite: when `true`, replaces existing entries in
    ///     `messageTranscriptions` / `messageTranslatedAudios`. Default
    ///     `false` preserves any in-memory state already written by a
    ///     concurrent socket delta (`applyAttachmentUpdate`). Pass
    ///     `true` from `refreshMessagesFromAPI` so a server-side
    ///     re-transcription propagates to the UI even when the message
    ///     already had a (stale) transcription cached.
    func hydrateMetadataFromGRDB(
        from records: [MessageRecord],
        forceOverwrite: Bool = false
    ) {
        applyAudioMetadata(AttachmentAudioMetadata.entries(fromRecords: records), forceOverwrite: forceOverwrite)
    }
}
