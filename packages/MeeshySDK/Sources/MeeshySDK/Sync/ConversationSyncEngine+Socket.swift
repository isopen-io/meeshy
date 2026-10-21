import Foundation
import Combine
import os

// ConversationSyncEngine — le SOCKET : relais et gestionnaires d’événements.
// Voir la note d'extraction en tête de `ConversationSyncEngine.swift` (#4172).

extension ConversationSyncEngine {
    // MARK: - Socket Relay

    public func startSocketRelay() async {
        socketSubscriptions.removeAll()
        let events = OrderedEventLane()
        let catchUp = OrderedEventLane()
        events.store(in: &socketSubscriptions)
        catchUp.store(in: &socketSubscriptions)
        relayMessageEvents(on: events)
        relayConversationEvents(on: events)
        relayEnrichmentEvents(on: events)
        relayCatchUp(on: catchUp)

        // Initial recompute so cold-start (cache already hydrated from disk
        // before any socket event arrives) publishes the correct aggregate
        // to subscribers. Without this, `totalConversationsUnreadValue`
        // stays at 0 until the first `unread-updated` event lands.
        await recomputeTotalUnread()
    }

    // UN SEUL consommateur sérialisé par famille (#11047) : les événements qui
    // mutent l'état s'appliquent dans l'ordre d'ARRIVÉE. Un `message:edited`
    // ne peut plus doubler le `message:new` du même message, suspendu dans sa
    // persistance — l'aperçu de liste et le cache perdaient l'édition.
    private func relayMessageEvents(on lane: OrderedEventLane) {
        messageSocket.messageReceived
            .relay(through: lane) { [weak self] in await self?.handleNewMessage($0) }
            .store(in: &socketSubscriptions)
        messageSocket.messageEdited
            .relay(through: lane) { [weak self] in await self?.handleEditedMessage($0) }
            .store(in: &socketSubscriptions)
        messageSocket.messageDeleted
            .relay(through: lane) { [weak self] in await self?.handleDeletedMessage($0) }
            .store(in: &socketSubscriptions)
        // `message:expired` (#7960) reçu conversation FERMÉE : sans ce relais,
        // seul `ConversationSocketHandler` (conversation ouverte) vidait le
        // message — son contenu restait lisible hors ligne, et dans l'aperçu.
        messageSocket.messageExpired
            .relay(through: lane) { [weak self] in await self?.handleExpiredMessage($0) }
            .store(in: &socketSubscriptions)
        // `message:cited-post-withdrawn` (#7969) : la story citée a été
        // retirée. Un seul site, conversation ouverte ou fermée.
        messageSocket.messageCitedPostWithdrawn
            .relay(through: lane) { [weak self] in await self?.handleCitedPostWithdrawn($0) }
            .store(in: &socketSubscriptions)
        // `message:consumed` (vue unique consommée) reçu conversation FERMÉE :
        // sans ce relais, le rouvrir hors-ligne réaffichait un média brûlé.
        messageSocket.messageConsumed
            .relay(through: lane) { [weak self] in await self?.handleMessageConsumed($0) }
            .store(in: &socketSubscriptions)
        // `message:view-once-purged` (#7578) : la bulle reste, vidée, en
        // « déjà ouvert ».
        messageSocket.viewOncePurged
            .relay(through: lane) { [weak self] in await self?.handleViewOncePurged($0) }
            .store(in: &socketSubscriptions)
        // `message:starred` (#7939) : l'étoile PERSONNELLE posée depuis un autre
        // appareil, reçue conversation ouverte OU fermée.
        messageSocket.messageStarred
            .relay(through: lane) { [weak self] in await self?.handleMessageStarred($0) }
            .store(in: &socketSubscriptions)
        messageSocket.reactionAdded
            .relay(through: lane) { [weak self] in await self?.handleReactionAdded($0) }
            .store(in: &socketSubscriptions)
        messageSocket.reactionRemoved
            .relay(through: lane) { [weak self] in await self?.handleReactionRemoved($0) }
            .store(in: &socketSubscriptions)
        messageSocket.reactionSynced
            .relay(through: lane) { [weak self] in await self?.handleReactionSynced($0) }
            .store(in: &socketSubscriptions)
    }

    private func relayConversationEvents(on lane: OrderedEventLane) {
        messageSocket.unreadUpdated
            .relay(through: lane) { [weak self] in await self?.handleUnreadUpdated($0) }
            .store(in: &socketSubscriptions)
        messageSocket.readStatusUpdated
            .relay(through: lane) { [weak self] in await self?.handleReadStatusUpdated($0) }
            .store(in: &socketSubscriptions)
        messageSocket.conversationClosed
            .relay(through: lane) { [weak self] in await self?.handleConversationClosed($0) }
            .store(in: &socketSubscriptions)
        // Métadonnées (titre, avatar, description…) : `ConversationStoreSocketBridge`
        // route la même diffusion vers le store RAM ; ce relais est ce qui la
        // fait survivre à un démarrage à froid.
        messageSocket.conversationUpdated
            .relay(through: lane) { [weak self] in await self?.handleConversationUpdated($0) }
            .store(in: &socketSubscriptions)
        // Profil public d'un CONTACT (nom, avatar, bannière).
        messageSocket.userUpdated
            .relay(through: lane) { [weak self] in await self?.handleUserUpdated($0) }
            .store(in: &socketSubscriptions)
        messageSocket.conversationDeleted
            .relay(through: lane) { [weak self] in await self?.handleConversationDeleted($0) }
            .store(in: &socketSubscriptions)
        // Conversation RESTAURÉE sur un autre appareil (#4389) — remise dans le
        // cache PERSISTÉ, pas seulement dans le store RAM.
        messageSocket.conversationRestored
            .relay(through: lane) { [weak self] in await self?.handleConversationRestored($0) }
            .store(in: &socketSubscriptions)
        messageSocket.conversationJoined
            .relay(through: lane) { [weak self] in await self?.cache.participants.invalidate(for: $0.conversationId) }
            .store(in: &socketSubscriptions)
        messageSocket.conversationLeft
            .relay(through: lane) { [weak self] in await self?.cache.participants.invalidate(for: $0.conversationId) }
            .store(in: &socketSubscriptions)
        messageSocket.participantRoleUpdated
            .relay(through: lane) { [weak self] in await self?.cache.participants.invalidate(for: $0.conversationId) }
            .store(in: &socketSubscriptions)
    }

    private func relayEnrichmentEvents(on lane: OrderedEventLane) {
        messageSocket.translationReceived
            .relay(through: lane) { [weak self] in await self?.cache.cacheTranslation($0) }
            .store(in: &socketSubscriptions)
        messageSocket.transcriptionReady
            .relay(through: lane) { [weak self] in await self?.cache.cacheTranscription($0) }
            .store(in: &socketSubscriptions)
        messageSocket.audioTranslationReady
            .relay(through: lane) { [weak self] in await self?.cache.cacheAudioTranslation($0) }
            .store(in: &socketSubscriptions)
        messageSocket.audioTranslationProgressive
            .relay(through: lane) { [weak self] in await self?.cache.cacheAudioTranslation($0) }
            .store(in: &socketSubscriptions)
        messageSocket.audioTranslationCompleted
            .relay(through: lane) { [weak self] in await self?.cache.cacheAudioTranslation($0) }
            .store(in: &socketSubscriptions)
        messageSocket.attachmentStatusUpdated
            .relay(through: lane) { [weak self] in await self?.handleAttachmentStatusUpdated($0) }
            .store(in: &socketSubscriptions)
        messageSocket.attachmentUpdated
            .relay(through: lane) { [weak self] in await self?.handleAttachmentUpdated($0) }
            .store(in: &socketSubscriptions)
    }

    // UN TROU DE SÉQUENCE DÉCLENCHE LA RESYNCHRONISATION `/sync` (#4172
    // critère 3) : des événements ont été MANQUÉS, et le socket ne rejouera
    // rien. Les rafales sont absorbées par `deltaSyncCooldown`. Les rattrapages
    // réseau ont leur file à part : un `/sync` lent ne retient aucun événement.
    private func relayCatchUp(on lane: OrderedEventLane) {
        SyncSeqTracker.shared.gapDetected.publisher
            .relay(through: lane) { [weak self] _ in _ = await self?.syncSinceLastCheckpoint() }
            .store(in: &socketSubscriptions)
        messageSocket.didReconnect
            .sink { [weak self] in
                guard let self else { return }
                requestReconnectCatchUp()
                lane.submit { [weak self] in _ = await self?.syncSinceLastCheckpoint() }
            }
            .store(in: &socketSubscriptions)
    }

    public func stopSocketRelay() async {
        socketSubscriptions.removeAll()
        // Les fenêtres d'accusé de réception ne survivent pas au relais : sur un
        // changement de compte, un envoi encore en attente partirait sous la
        // session SUIVANTE.
        let pending: [Task<Void, Never>] = stateQueue.sync {
            let tasks = Array(_markAsReceivedTasks.values)
            _markAsReceivedTasks.removeAll()
            return tasks
        }
        pending.forEach { $0.cancel() }
    }

    // MARK: - Socket Event Handlers

    private func handleConversationClosed(_ event: ConversationClosedEvent) async {
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == event.conversationId }) {
                updated[idx].closedAt = WireDate.date(from: event.closedAt)
                updated[idx].closedBy = event.closedBy
            }
            return updated
        }
        _conversationsDidChange.send()
    }

    private func handleViewOncePurged(_ event: ViewOncePurgedEvent) async {
        await realtimeMessagePersistor?(.viewOnceOpened(messageId: event.messageId))
        _messagesDidChange.send(event.conversationId)
    }

    private func handleMessageStarred(_ event: MessageStarredEvent) async {
        await realtimeMessagePersistor?(Self.starMutation(for: event, now: Date()))
    }

    private func handleNewMessage(_ apiMessage: APIMessage) async {
        Self.logger.info("[SyncEngine] handleNewMessage id=\(apiMessage.id, privacy: .public) conv=\(apiMessage.conversationId, privacy: .public)")
        if let mentionedUsers = apiMessage.mentionedUsers {
            UserDisplayNameCache.shared.trackFromMentionedUsers(mentionedUsers)
        }
        let userId = await currentUserId(); let username = await currentUsername()
        let displayName = await currentUserDisplayName()
        let preferredLanguages = await currentPreferredLanguages()
        let isMe = apiMessage.senderId == userId
        let msg = apiMessage.toMessage(
            currentUserId: userId, currentUsername: username, currentUserDisplayName: displayName, preferredLanguages: preferredLanguages)
        await cache.messages.upsert(item: msg, for: msg.conversationId) { existing, new in
            // Le plafond de la politique (600) ne s'appliquait qu'à `save` : une conversation active jamais
            // ouverte gagnait chaque message reçu, et chaque ajout recopiait et ré-encodait tout le tableau.
            existing.contains(where: { $0.id == new.id })
                ? existing
                : Array((existing + [new]).suffix(CachePolicy.messages.maxItemCount ?? Int.max))
        }
        // Persist into the app's GRDB message store too — this is the ONLY
        // global `message:new` sink, so without it a broadcast for a CLOSED
        // conversation updates the list preview but never reaches the
        // timeline the conversation screen renders. The upsert reconciles by
        // clientMessageId/serverId, so the open conversation's own handler
        // buffering the same payload stays idempotent — and an own-echo
        // arriving after the user navigated away still flips its optimistic
        // `.sending` row to `.sent` instead of leaving the clock forever.
        // #8656 — reçu pour `userId`, il ne s'écrit que dans SA base.
        await Self.$syncOwner.withValue(userId) {
            await apiMessagePersistor?([apiMessage])
        }
        _messagesDidChange.send(msg.conversationId)

        // Facette COMPLÈTE du nouveau dernier message. Les onze champs
        // `lastMessage*` décrivent un seul message : n'en écrire que trois
        // laissait la ligne mélanger le texte du nouveau message avec la pièce
        // jointe, l'expiration et le drapeau « vue unique » de l'ANCIEN — un
        // texte tout neuf résumé « Vue unique » parce que la photo précédente
        // l'était. Cf. `LastMessageFacet`.
        //
        // Changement assumé : quand un écho socket allégé omet l'enveloppe
        // expéditeur, l'auteur devient `nil` au lieu de conserver le précédent.
        // Garder l'ancien collait le nom d'Alice sous le message de Bob — la
        // ligne était FAUSSE, pas incomplète, et rien ne la corrigeait. Ne pas
        // « restaurer » ce repli.
        let facet = LastMessageFacet(
            message: msg,
            preview: msg.content,
            translations: Self.previewTranslations(
                from: apiMessage,
                viewerLanguages: preferredLanguages
            )
        )

        // Snapshot the cached list to decide whether the conversation
        // already exists. The `update` mutate closure is sync +
        // nonisolated, so we can't fetch from inside it — branch here.
        let cachedList = await cache.conversations.load(for: "list")
        let conversationExists = cachedList.snapshot()?.contains(where: { $0.id == msg.conversationId }) ?? false

        if conversationExists {
            // Garde d'ordre PARTAGÉE (#7548) : un `message:new` plus ancien que
            // l'aperçu en place ne le régresse pas, mais le MÊME message le
            // complète — `conversation:updated` a pu le devancer avec
            // l'identité et le texte seuls. `clientMessageId` est l'autre nom
            // de mon propre envoi, posé en `cid_…` par l'optimiste.
            let aliases = apiMessage.clientMessageId.map { [$0] } ?? []
            await cache.conversations.update(for: "list") { conversations in
                ConversationListLastMessage.applying(
                    facet, conversationId: msg.conversationId, aliases: aliases, to: conversations
                ) ?? conversations
            }
        } else {
            // First time this device sees the conversation (brand-new
            // DM, group invite the user just got added to, or a record
            // missed by `fullSync()`'s parallel page fetches). Pull the
            // full conversation row from the API and prepend it so the
            // list surfaces the new chat in real time instead of
            // waiting for the next manual refresh.
            do {
                let apiConv = try await ConversationService.shared.getById(msg.conversationId)
                let userId = await currentUserId()
                let domainConv = apiConv.toConversation(currentUserId: userId)
                await cache.conversations.update(for: "list") { conversations in
                    var updated = conversations
                    // Defensive dedup: a concurrent handleNewMessage
                    // for the same conversation could have raced ahead.
                    updated.removeAll { $0.id == domainConv.id }
                    updated.insert(domainConv, at: 0)
                    return updated
                }
                // The freshly-fetched conversation may carry an `unreadCount`
                // > 0 (group the user was added to, missed during fullSync).
                // Recompute now so the back-button pill is correct before
                // the next `conversation:unread-updated` arrives.
                await recomputeTotalUnread()
            } catch {
                Self.logger.error("[SyncEngine] Failed to fetch missing conversation \(msg.conversationId): \(error.localizedDescription)")
            }
        }
        _conversationsDidChange.send()

        // Auto mark-as-received for messages from other users — coalescé par
        // conversation (voir `_markAsReceivedTasks`).
        if !isMe {
            scheduleMarkAsReceived(for: msg.conversationId)
        }
    }

    /// Ouvre (ou rejoint) la fenêtre de coalescence d'une conversation. Le
    /// PREMIER message de la rafale arme l'envoi ; les suivants tombent sur une
    /// fenêtre déjà ouverte et ne coûtent rien.
    private func scheduleMarkAsReceived(for conversationId: String) {
        let window = markAsReceivedWindow
        // La table des tâches EST la fenêtre : une entrée présente signifie
        // « déjà armée ». Un jeu d'ids en attente à côté d'elle se
        // désynchroniserait — la tâche s'y retirant elle-même, une seconde
        // rafale pourrait réarmer avant que la première ne se soit enregistrée,
        // et `stopSocketRelay` n'aurait plus que la tâche MORTE à annuler.
        stateQueue.sync {
            guard _markAsReceivedTasks[conversationId] == nil else { return }
            _markAsReceivedTasks[conversationId] = Task { [weak self] in
                guard await cancellableSleep(for: .seconds(window)), let self else { return }
                // La fenêtre se ferme AVANT l'envoi : un message arrivant
                // pendant l'aller-retour ouvre la fenêtre SUIVANTE au lieu
                // d'être avalé.
                self.stateQueue.sync { _ = self._markAsReceivedTasks.removeValue(forKey: conversationId) }
                guard !Task.isCancelled else { return }
                do {
                    try await self.conversationService.markAsReceived(conversationId: conversationId)
                } catch {
                    Self.logger.error("[SyncEngine] markAsReceived failed for \(conversationId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                }
            }
        }
    }

    private func handleEditedMessage(_ apiMessage: APIMessage) async {
        let userId = await currentUserId(); let username = await currentUsername()
        let displayName = await currentUserDisplayName()
        let preferredLanguages = await currentPreferredLanguages()
        let msg = apiMessage.toMessage(
            currentUserId: userId, currentUsername: username, currentUserDisplayName: displayName, preferredLanguages: preferredLanguages)
        await cache.messages.upsertPatch(for: msg.conversationId, itemId: msg.id) { existing in
            existing = Self.edit(msg, keepingLocalStateOf: existing)
        }
        await realtimeMessagePersistor?(Self.mutation(for: apiMessage, content: msg.content))
        _messagesDidChange.send(msg.conversationId)
        // If the edited message is the conversation's last message, the list-row
        // preview still shows the pre-edit text — refresh it in place.
        await refreshLastMessagePreviewIfEdited(
            conversationId: msg.conversationId, messageId: msg.id, newContent: msg.content,
            systemEvent: apiMessage.systemEvent)
    }

    /// `message:edited` ne sert que le texte : les réactions et les pièces
    /// jointes que la charge ne porte pas restent celles du cache (#7927).
    static func edit(_ edited: MeeshyMessage, keepingLocalStateOf existing: MeeshyMessage) -> MeeshyMessage {
        var merged = edited
        if merged.reactions.isEmpty { merged.reactions = existing.reactions }
        if merged.attachments.isEmpty { merged.attachments = existing.attachments }
        return merged
    }

    private func handleDeletedMessage(_ event: MessageDeletedEvent) async {
        let callId = await cache.messages.load(for: event.conversationId).snapshot()?
            .first(where: { $0.id == event.messageId })?.callSummary?.callId

        let deletedAt = Date()
        await cache.messages.upsertPatch(for: event.conversationId, itemId: event.messageId) { msg in
            msg.deletedAt = deletedAt
            msg.content = ""
        }
        await dropFromMediaIndex(conversationId: event.conversationId, messageId: event.messageId)
        await realtimeMessagePersistor?(.deleted(messageId: event.messageId, deletedAt: deletedAt))
        if let callId {
            await CallTranscriptStore.shared.invalidate(for: callId)
        }
        _messagesDidChange.send(event.conversationId)
        // If the deleted message was the conversation's last message, the list-row
        // preview still shows the (now-deleted) text — recompute it from the most
        // recent surviving message, mirroring the gateway's `deletedAt: null` REST list.
        await recomputeLastMessagePreviewAfterDeletion(
            conversationId: event.conversationId, deletedMessageId: event.messageId)
    }

    /// #8095 — un message supprimé ou échu quitte l'INDEX des médias : la
    /// galerie feuillette aussi les messages hors de la fenêtre chargée, et y
    /// retrouver une photo retirée serait une fuite, pas un cache. #8103 — de
    /// TOUS les genres de l'index (documents, liens, audios…).
    private func dropFromMediaIndex(conversationId: String, messageId: String) async {
        await cache.dropFromConversationMedia(conversationId: conversationId, messageId: messageId)
    }

    /// **La flamme-œil lue, retirée à la sortie** (#8303) — le MÊME effet local
    /// qu'un `message:expired` servi : contenu vidé, ligne GRDB marquée, index
    /// média purgé, mort gravée au registre, aperçu recalculé. Le serveur
    /// n'émet `message:expired` qu'aux AUTRES appareils du lecteur ; celui qui
    /// consomme applique donc lui-même ce que les autres recevront.
    public func expireLocally(conversationId: String, messageIds: [String]) async {
        for messageId in messageIds {
            await handleExpiredMessage(MessageExpiredEvent(messageId: messageId, conversationId: conversationId))
        }
    }

    /// `message:expired` — même effet local que la suppression : contenu vidé,
    /// aperçu recalculé. La table canonique reçoit `.expired`, que l'hôte
    /// applique comme la conversation ouverte (citations scellées, favori
    /// retiré). La mort se GRAVE au registre de réception (#7552).
    private func handleExpiredMessage(_ event: MessageExpiredEvent) async {
        let expiredAt = Date()
        await cache.messages.upsertPatch(for: event.conversationId, itemId: event.messageId) { msg in
            msg.deletedAt = expiredAt
            msg.content = ""
        }
        await dropFromMediaIndex(conversationId: event.conversationId, messageId: event.messageId)
        await realtimeMessagePersistor?(.expired(messageId: event.messageId, expiredAt: expiredAt))
        EphemeralReceiptLedger.shared.noteDestruction(of: event.messageId)
        _messagesDidChange.send(event.conversationId)
        await recomputeLastMessagePreviewAfterDeletion(
            conversationId: event.conversationId, deletedMessageId: event.messageId)
    }

    private func handleCitedPostWithdrawn(_ event: MessageCitedPostWithdrawnEvent) async {
        await cache.messages.update(for: event.conversationId) { messages in
            Self.withdrawingCitedPost(event.postId, in: messages) ?? messages
        }
        await realtimeMessagePersistor?(.citedPostWithdrawn(
            postId: event.postId, conversationId: event.conversationId, deletedAt: event.deletedAt))
        _messagesDidChange.send(event.conversationId)
    }

    /// Les messages dont la citation désigne le post retiré, rendus « Story
    /// indisponible » ; `nil` quand aucun ne change (aucune écriture cache).
    nonisolated static func withdrawingCitedPost(_ postId: String, in messages: [MeeshyMessage]) -> [MeeshyMessage]? {
        let unavailable = ReplyReference.unavailableStory(storyId: postId)
        var changed = false
        let next = messages.map { message -> MeeshyMessage in
            let cites = message.storyReplyToId == postId
                || (message.replyTo?.isStoryReply == true && message.replyTo?.messageId == postId)
            guard cites, message.replyTo != unavailable else { return message }
            var copy = message
            copy.replyTo = unavailable
            changed = true
            return copy
        }
        return changed ? next : nil
    }

    /// Updates a conversation row's `lastMessagePreview` when the edited message
    /// is that row's `lastMessageId`. No-op otherwise (editing an older message
    /// leaves the preview untouched). Fires `_conversationsDidChange` only when a
    /// row actually changed.
    ///
    /// Une édition garde le MÊME message : l'auteur, les pièces jointes et les
    /// drapeaux éphémères restent vrais, et ce chemin n'y touche pas. Seule la
    /// carte du Prisme devient fausse — elle traduit le texte remplacé — et
    /// c'est celle que le résolveur préfère.
    ///
    /// #8565 — un avis que le SERVEUR complète sur place (la ligne d'arrivées
    /// de Meeshy Global) n'a pas d'autre diffusion que celle-ci : son
    /// `systemEvent` servi remplace celui de la nature, que le composeur
    /// préfère au texte stocké (un repli français).
    private func refreshLastMessagePreviewIfEdited(
        conversationId: String, messageId: String, newContent: String, systemEvent: LastMessageSystemEvent?
    ) async {
        let list = await cache.conversations.load(for: "list").snapshot() ?? []
        guard list.first(where: { $0.id == conversationId })?.lastMessageId == messageId else { return }
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == conversationId }) {
                updated[idx].lastMessagePreview = newContent.meeshyPreviewTruncated
                // La carte du Prisme traduisait le texte D'AVANT. Le résolveur
                // (`resolvedLastMessagePreview`) la PRÉFÈRE à l'aperçu brut :
                // la garder ici réécrivait le texte visible… pour personne, le
                // lecteur servi par une traduction continuant de lire la phrase
                // pré-édition. Le serveur fait le même geste dans la même
                // écriture — `routes/messages.ts` remet `Message.translations`
                // à `null` avec le nouveau contenu, et `emitConversationPreview
                // Update` l'annonce par `.replaced([:])`.
                //
                // `lastMessageOriginalLanguage` reste : le message n'a pas
                // changé d'identité, et sans carte le résolveur ne le consulte
                // plus. Le prochain `conversation:updated` reposera les deux.
                updated[idx].lastMessageTranslations = nil
                if let systemEvent {
                    updated[idx].lastMessageNature = (updated[idx].lastMessageNature
                        ?? LastMessageNature(messageType: "system")).replacingSystemEvent(systemEvent)
                }
            }
            return updated
        }
        _conversationsDidChange.send()
    }

    /// Un message optimiste RETIRÉ sans avoir existé côté serveur — un envoi
    /// refusé pour de bon (403 `GLOBAL_ADULTS_ONLY`, #9929). L'aperçu de la
    /// ligne avait été posé avant le refus (`updateConversationAfterSend`) : il
    /// se recalcule exactement comme après une suppression, sur le dernier
    /// message survivant ou, faute de cache, sur la ligne relue au serveur.
    public func withdrawLocalMessage(conversationId: String, messageId: String) async {
        await recomputeLastMessagePreviewAfterDeletion(conversationId: conversationId, deletedMessageId: messageId)
    }

    /// Recomputes a conversation row's last-message fields when the deleted
    /// message was that row's `lastMessageId`, picking the most recent surviving
    /// (non-deleted) message from the messages cache. If the cache holds no
    /// replacement (older messages never loaded), the row is left untouched — the
    /// next REST list refresh (which filters `deletedAt: null`) corrects it —
    /// rather than wrongly clearing a preview that should show an earlier message.
    private func recomputeLastMessagePreviewAfterDeletion(
        conversationId: String, deletedMessageId: String
    ) async {
        let list = await cache.conversations.load(for: "list").snapshot() ?? []
        guard list.first(where: { $0.id == conversationId })?.lastMessageId == deletedMessageId else { return }
        let messages = await cache.messages.load(for: conversationId).snapshot() ?? []
        if let newLast = Self.mostRecentSurvivor(in: messages, excluding: deletedMessageId) {
            await cache.conversations.update(for: "list") { conversations in
                var updated = conversations
                if let idx = updated.firstIndex(where: { $0.id == conversationId }) {
                    // Le survivant est ici TOUT ENTIER : la facette s'écrit donc
                    // en bloc, plutôt que quatre champs à la main. Les sept
                    // autres décrivaient encore le message SUPPRIMÉ — sa
                    // vignette, son « Vue unique », son expiration, sa carte de
                    // traductions (que le résolveur PRÉFÈRE à l'aperçu, donc la
                    // ligne rendait le texte traduit du disparu). Même défaut
                    // que celui du chemin reçu, découvert localement.
                    updated[idx].applyLastMessage(LastMessageFacet(
                        message: newLast,
                        preview: newLast.content
                    ))
                }
                return updated
            }
            _conversationsDidChange.send()
            return
        }
        // Aucun survivant EN CACHE ne veut pas dire aucun message : une
        // conversation jamais ouverte n'a aucun message chargé. La vider ici
        // effaçait la ligne alors que le message PRÉCÉDENT existe (#7548,
        // décision porteur : y revenir). Le serveur le connaît — il filtre
        // `deletedAt: null` — donc on lui relit la ligne. Seul l'échec de
        // cette lecture vide encore la ligne : sans remplaçant connu, un
        // aperçu vide vaut mieux que le texte d'un message supprimé.
        let userId = await currentUserId()
        let server = try? await conversationService.getById(conversationId).toConversation(currentUserId: userId)
        await cache.conversations.update(for: "list") { conversations in
            ConversationListLastMessage.revertingDeletion(
                of: deletedMessageId, conversationId: conversationId, server: server, in: conversations
            ) ?? conversations
        }
        _conversationsDidChange.send()
    }

    /// The most recent non-deleted message in a conversation, excluding the one
    /// just deleted — i.e. the message that should become the list-row preview
    /// after a deletion. `nil` when every message is gone. Pure + testable.
    nonisolated static func mostRecentSurvivor(
        in messages: [MeeshyMessage],
        excluding deletedMessageId: String
    ) -> MeeshyMessage? {
        messages
            .filter { $0.deletedAt == nil && $0.id != deletedMessageId }
            .max(by: { $0.createdAt < $1.createdAt })
    }

    private func handleReactionAdded(_ event: ReactionUpdateEvent) async {
        guard let convId = event.conversationId else { return }
        let reaction = MeeshyReaction(
            messageId: event.messageId,
            participantId: event.participantId,
            emoji: event.emoji
        )
        // MÊME loi que la base (`ReactionLedger`, #7927) : ma réaction s'écrit sous mon `User.id`, la clé que teste la
        // pastille « c'est moi » — l'écho de ma propre réaction optimiste ne double plus.
        let me = await currentUserId()
        let currentUserId: String? = me.isEmpty ? nil : me
        let reactionId = reaction.id
        let messageId = event.messageId
        let emoji = event.emoji
        let participantId = event.participantId
        let ownerUserId = event.userId
        let maxCount = event.aggregation?.count
        await cache.messages.upsertPatch(for: convId, itemId: event.messageId) { msg in
            if let next = ReactionLedger.appending(
                msg.reactions, reactionId: reactionId, messageId: messageId, emoji: emoji,
                participantId: participantId, ownerUserId: ownerUserId,
                currentUserId: currentUserId, maxCount: maxCount
            ) {
                msg.reactions = next
            }
        }
        await realtimeMessagePersistor?(.reactionAdded(
            messageId: event.messageId,
            reactionId: reaction.id,
            emoji: event.emoji,
            participantId: event.participantId,
            maxCount: event.aggregation?.count,
            ownerUserId: event.userId
        ))
        _messagesDidChange.send(convId)
    }

    private func handleReactionRemoved(_ event: ReactionUpdateEvent) async {
        guard let convId = event.conversationId else { return }
        let me = await currentUserId()
        let currentUserId: String? = me.isEmpty ? nil : me
        let emoji = event.emoji
        let participantId = event.participantId
        let ownerUserId = event.userId
        let aggregate = event.aggregation.map { ReactionLedger.Aggregate(count: $0.count, participantIds: $0.participantIds) }
        await cache.messages.upsertPatch(for: convId, itemId: event.messageId) { msg in
            if let next = ReactionLedger.removing(
                msg.reactions, emoji: emoji, participantId: participantId,
                ownerUserId: ownerUserId, currentUserId: currentUserId, aggregate: aggregate
            ) {
                msg.reactions = next
            }
        }
        await realtimeMessagePersistor?(.reactionRemoved(
            messageId: event.messageId,
            emoji: event.emoji,
            participantId: event.participantId,
            ownerUserId: event.userId,
            aggregateCount: event.aggregation?.count,
            aggregateParticipantIds: event.aggregation?.participantIds
        ))
        _messagesDidChange.send(convId)
    }

    /// Une réaction par unité de compte, chacune portant son participant quand
    /// le serveur le nomme. Un compte négatif servi par le serveur faisait
    /// planter la plage `0..<count` : il est borné comme dans `ReactionLedger`.
    nonisolated static func expandedReactions(messageId: String, aggregations: [ReactionAggregationEvent]) -> [MeeshyReaction] {
        aggregations.flatMap { agg in
            let pids = agg.participantIds ?? []
            return (0..<min(max(0, agg.count), 10_000)).map { index in
                MeeshyReaction(
                    messageId: messageId,
                    participantId: index < pids.count ? pids[index] : nil,
                    emoji: agg.emoji
                )
            }
        }
    }

    private func handleReactionSynced(_ event: ReactionSyncEvent) async {
        let messageId = event.messageId
        let reactions = event.reactions
        let keys = await cache.messages.loadedKeys()
        for key in keys {
            await cache.messages.update(for: key) { existing in
                existing.map { msg in
                    guard msg.id == messageId else { return msg }
                    var updated = msg
                    updated.reactions = Self.expandedReactions(messageId: messageId, aggregations: reactions)
                    return updated
                }
            }
        }
    }

    private func handleUnreadUpdated(_ event: UnreadUpdateEvent) async {
        // Gate the server-provided value on whether the user is currently
        // viewing this conversation. The gateway broadcasts the same
        // `unreadCount` to every recipient regardless of presence; the
        // client overrides it to 0 for the open conversation because the
        // user IS reading it. This avoids the "11 → 75 then back to 0"
        // visual flicker when a stale server count momentarily lands.
        //
        // Ce zéro est un AFFICHAGE, pas une lecture (#7350) : le compte servi
        // est ce qui reste vraiment non lu — un message arrivé sans être vu,
        // ou l'arriéré après un accusé partiel. Il est retenu pour la
        // fermeture, qui le rend à la ligne (`restoreUnreadOnClose`) ; sans
        // lui, la liste redisait 0 pendant que le badge, qui suit le serveur,
        // comptait la conversation. Ignoré si elle n'est pas ouverte.
        noteUnreadRemaining(event.conversationId, event.unreadCount)
        let effectiveUnread = isConversationOpen(event.conversationId)
            ? 0
            : event.unreadCount
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == event.conversationId }) {
                updated[idx].userState.unreadCount = effectiveUnread
                // G-124 — le pont ✦ voyage sur CE même événement (G-123,
                // `ConversationUnreadUpdatedEventData.bridge`).
                //
                // Cycle 63 : on ÉCRIT sur ce qu'annonce le serveur, plus sur la
                // valeur d'un optionnel. `event.bridge` valait `nil` aussi bien
                // quand le serveur disait « il n'y a pas de pont » que quand il
                // ne disait rien du tout, et cette ligne recopiait les deux —
                // si bien que tout émetteur qui ne calculait pas le pont en
                // ordonnait l'effacement. C'est ce qui retirait le pont de
                // TOUTES les lignes du lecteur à chaque reconnexion.
                //
                // `.notComputed` ne touche à rien : un silence ne détruit pas.
                switch event.announcement {
                case .notComputed:
                    break
                case .cleared:
                    updated[idx].bridge = nil
                case .bridge(let bridge):
                    updated[idx].bridge = bridge
                }
            }
            return updated
        }
        _conversationsDidChange.send()
        await recomputeTotalUnread()
    }

    private func handleReadStatusUpdated(_ event: ReadStatusUpdateEvent) async {
        let userId = await currentUserId()

        // Update conversation unread count (userId is preferred, fallback to participantId)
        let eventUserId = event.userId ?? event.participantId

        // CRITICAL: only zero unreadCount on a true 'read' event. The gateway
        // also emits this event with type=='received' when the delivery cursor
        // advances (e.g. our own AppDelegate.willPresent → PushDeliveryReceiptService.ack
        // → POST /mark-as-received). A 'received' event means "the message
        // reached this device" — NOT "the user opened the conversation".
        // Wiping unreadCount on 'received' caused the badge flicker the user
        // saw: handleUnreadUpdated bumps it to 1 when the message lands, then
        // a 'received' read-status:updated arrives moments later and wipes
        // it to 0 even though the conversation is still unread.
        if eventUserId == userId && event.type == "read" {
            let authoritative = event.unreadCount ?? 0
            await cache.conversations.update(for: "list") { conversations in
                var updated = conversations
                if let idx = updated.firstIndex(where: { $0.id == event.conversationId }) {
                    updated[idx].userState.unreadCount = authoritative
                }
                return updated
            }
            _conversationsDidChange.send()
            await recomputeTotalUnread()
        }

        // #7433 — le résumé ne touche que le message qu'il décrit, s'il est
        // le mien (`ReadStatusReceipt`), même règle que la base GRDB.
        let summary = event.summary
        await cache.messages.update(for: event.conversationId) { messages in
            Self.applyReadReceipt(to: messages, summary: summary)
        }
        _messagesDidChange.send(event.conversationId)
    }

    /// Pose un résumé d'accusé sur le SEUL message qu'il décrit — celui qu'il
    /// nomme, sinon le dernier message acquitté du fil (passerelle d'avant
    /// #7433) — et seulement si ce message est le mien. Compteurs fusionnés
    /// sans recul, coche dérivée des compteurs (tout-ou-rien en groupe) et
    /// jamais rétrogradée. Pure + testable.
    nonisolated static func applyReadReceipt(
        to messages: [MeeshyMessage],
        summary: ReadStatusSummary
    ) -> [MeeshyMessage] {
        let inFlight: Set<MeeshyMessage.DeliveryStatus> = [.sending, .invisible, .clock, .slow, .failed]
        let latestAcked = messages
            .filter { !inFlight.contains($0.deliveryStatus) }
            .max { $0.createdAt < $1.createdAt }
        guard let targetId = ReadStatusReceipt.describedMessageId(of: summary, latestMessageId: latestAcked?.id),
              let index = messages.firstIndex(where: { $0.id == targetId }),
              messages[index].isMe
        else { return messages }
        let target = messages[index]
        let current = ReadStatusReceipt.Counters(
            deliveredCount: target.deliveredCount,
            readCount: target.readCount,
            recipientCount: target.recipientCount,
            readByAllAt: target.readByAllAt
        )
        let next = ReadStatusReceipt.merged(current, with: summary)
        guard next != current else { return messages }
        var updated = messages
        updated[index].deliveredCount = next.deliveredCount
        updated[index].readCount = next.readCount
        updated[index].recipientCount = next.recipientCount
        updated[index].readByAllAt = next.readByAllAt
        let derived = DeliveryStatusResolver.fromCounts(
            deliveredCount: next.deliveredCount,
            readCount: next.readCount,
            recipientCount: next.recipientCount
        )
        if derived.isBetterThan(target.deliveryStatus) {
            updated[index].deliveryStatus = derived
        }
        return updated
    }

    /// Classe un `message:edited` : un message porteur d'un résumé d'appel
    /// décrit la fin de l'appel, pas une édition utilisateur. Le confondre avec
    /// `.edited` poserait « modifié » sur un avis d'appel et écraserait le
    /// résumé — même distinction que `ConversationSocketHandler` applique déjà
    /// sur la conversation ouverte. Pure + testable.
    /// Une étoile posée sans date (charge dégradée) est datée à la RÉCEPTION :
    /// elle ne se perd jamais faute d'instant. Pure + testable.
    nonisolated static func starMutation(for event: MessageStarredEvent, now: Date) -> RealtimeMessageMutation {
        guard event.starred else { return .unstarred(messageId: event.messageId) }
        return .starred(messageId: event.messageId, conversationId: event.conversationId,
                        starredAt: event.starredAt ?? now)
    }

    nonisolated static func mutation(
        for apiMessage: APIMessage, content: String
    ) -> RealtimeMessageMutation {
        guard let callSummary = apiMessage.callSummary else {
            // L'horloge SERVEUR, jamais celle de l'appareil : `markEdited`
            // compare cet instant au précédent pour rejeter les échos
            // désordonnés, ce qui n'a de sens qu'entre horloges comparables.
            return .edited(
                messageId: apiMessage.id,
                content: content,
                editedAt: apiMessage.editedAt ?? Date(),
                marksEdited: apiMessage.isEdited ?? true
            )
        }
        return .callNoticeUpdated(
            messageId: apiMessage.id,
            content: content,
            callSummaryJson: try? JSONEncoder().encode(callSummary),
            serverUpdatedAt: apiMessage.updatedAt ?? apiMessage.editedAt ?? Date()
        )
    }

}
