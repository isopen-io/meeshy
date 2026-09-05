import Foundation
import Combine
import os

// ConversationSyncEngine — le SOCKET : relais et gestionnaires d’événements.
// Voir la note d'extraction en tête de `ConversationSyncEngine.swift` (#4172).

extension ConversationSyncEngine {
    // MARK: - Socket Relay

    public func startSocketRelay() async {
        socketSubscriptions.removeAll()

        // UN TROU DE SÉQUENCE DÉCLENCHE LA RESYNCHRONISATION `/sync` (#4172
        // critère 3). `SyncSeqTracker.observe` émet quand un `_seq` saute — des
        // événements ont été MANQUÉS, et le socket ne rejouera rien. La réponse
        // est le delta nominal (`syncSinceLastCheckpoint` → `/sync`, `hasGap`
        // escaladant vers `fullSync` si l'absence dépasse ce que la fenêtre
        // sait rejouer). Les rafales sont absorbées par `deltaSyncCooldown` —
        // le même amortisseur que les reconnexions.
        SyncSeqTracker.shared.gapDetected.publisher
            .sink { [weak self] _ in
                guard let self else { return }
                Task { await self.syncSinceLastCheckpoint() }
            }
            .store(in: &socketSubscriptions)

        // Message events
        messageSocket.messageReceived
            .sink { [weak self] apiMessage in
                guard let self else { return }
                Task { await self.handleNewMessage(apiMessage) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.messageEdited
            .sink { [weak self] apiMessage in
                guard let self else { return }
                Task { await self.handleEditedMessage(apiMessage) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.messageDeleted
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleDeletedMessage(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.reactionAdded
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleReactionAdded(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.reactionRemoved
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleReactionRemoved(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.reactionSynced
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleReactionSynced(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.unreadUpdated
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleUnreadUpdated(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.readStatusUpdated
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleReadStatusUpdated(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.translationReceived
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.cache.cacheTranslation(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.transcriptionReady
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.cache.cacheTranscription(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.audioTranslationReady
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.cache.cacheAudioTranslation(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.audioTranslationProgressive
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.cache.cacheAudioTranslation(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.audioTranslationCompleted
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.cache.cacheAudioTranslation(event) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.conversationJoined
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.cache.participants.invalidate(for: event.conversationId) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.conversationLeft
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.cache.participants.invalidate(for: event.conversationId) }
            }
            .store(in: &socketSubscriptions)

        messageSocket.participantRoleUpdated
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.cache.participants.invalidate(for: event.conversationId) }
            }
            .store(in: &socketSubscriptions)

        // Attachment status updated (listened, watched, viewed, downloaded)
        messageSocket.attachmentStatusUpdated
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleAttachmentStatusUpdated(event) }
            }
            .store(in: &socketSubscriptions)

        // Attachment content updated (Whisper transcription, NLLB+TTS audio translation)
        messageSocket.attachmentUpdated
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleAttachmentUpdated(event) }
            }
            .store(in: &socketSubscriptions)

        // Conversation closed
        messageSocket.conversationClosed
            .sink { [weak self] event in
                guard let self else { return }
                Task {
                    await self.cache.conversations.update(for: "list") { conversations in
                        var updated = conversations
                        if let idx = updated.firstIndex(where: { $0.id == event.conversationId }) {
                            updated[idx].closedAt = ISO8601DateFormatter().date(from: event.closedAt)
                            updated[idx].closedBy = event.closedBy
                        }
                        return updated
                    }
                    self._conversationsDidChange.send()
                }
            }
            .store(in: &socketSubscriptions)

        // Conversation metadata updated (title, avatar, description, …).
        // `ConversationStoreSocketBridge` routes the same broadcast to the RAM
        // store; this relay is what makes it survive a cold start.
        messageSocket.conversationUpdated
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleConversationUpdated(event) }
            }
            .store(in: &socketSubscriptions)

        // Profil public d'un CONTACT (nom, avatar, bannière). Même raison que
        // le relais ci-dessus : sans lui, la ligne redevient périmée au
        // prochain démarrage à froid, le temps que le REST réponde.
        messageSocket.userUpdated
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleUserUpdated(event) }
            }
            .store(in: &socketSubscriptions)

        // Conversation deleted server-side — drop the row (and its messages)
        // from the persisted cache, not only from the RAM store.
        messageSocket.conversationDeleted
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleConversationDeleted(event) }
            }
            .store(in: &socketSubscriptions)

        // Conversation RESTAURÉE sur un autre appareil (#4389) — la remettre
        // dans le cache PERSISTÉ, pas seulement dans le store RAM. Sans ce
        // relais, la restauration ne survivait pas au prochain démarrage à
        // froid : le cache disque continuait de servir une liste d'où la
        // conversation avait été retirée, exactement le défaut symétrique que
        // le doc-comment de la descendante nomme au-dessus.
        messageSocket.conversationRestored
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleConversationRestored(event) }
            }
            .store(in: &socketSubscriptions)

        // `message:consumed` (vue unique consommée) reçu conversation FERMÉE :
        // sans ce relais, seule la conversation ouverte marquait le message
        // consommé — le rouvrir hors-ligne réaffichait un média déjà brûlé.
        messageSocket.messageConsumed
            .sink { [weak self] event in
                guard let self else { return }
                Task { await self.handleMessageConsumed(event) }
            }
            .store(in: &socketSubscriptions)

        // Reconnect -> delta sync
        messageSocket.didReconnect
            .sink { [weak self] in
                guard let self else { return }
                Task { await self.syncSinceLastCheckpoint() }
            }
            .store(in: &socketSubscriptions)

        // Initial recompute so cold-start (cache already hydrated from disk
        // before any socket event arrives) publishes the correct aggregate
        // to subscribers. Without this, `totalConversationsUnreadValue`
        // stays at 0 until the first `unread-updated` event lands.
        await recomputeTotalUnread()
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
            existing.contains(where: { $0.id == new.id }) ? existing : existing + [new]
        }
        // Persist into the app's GRDB message store too — this is the ONLY
        // global `message:new` sink, so without it a broadcast for a CLOSED
        // conversation updates the list preview but never reaches the
        // timeline the conversation screen renders. The upsert reconciles by
        // clientMessageId/serverId, so the open conversation's own handler
        // buffering the same payload stays idempotent — and an own-echo
        // arriving after the user navigated away still flips its optimistic
        // `.sending` row to `.sent` instead of leaving the clock forever.
        await apiMessagePersistor?([apiMessage])
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
            await cache.conversations.update(for: "list") { conversations in
                var updated = conversations
                if let idx = updated.firstIndex(where: { $0.id == msg.conversationId }) {
                    // Monotone guard: a REST send racing the socket broadcast
                    // (or any other out-of-order `message:new`) must not
                    // regress the row to older content/position once a
                    // newer message has already been applied.
                    guard msg.createdAt > updated[idx].lastMessageAt else { return updated }
                    updated[idx].applyLastMessage(facet)
                    let conv = updated.remove(at: idx)
                    updated.insert(conv, at: 0)
                }
                return updated
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
                try? await Task.sleep(nanoseconds: UInt64(window * 1_000_000_000))
                guard let self else { return }
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
            existing = msg
        }
        await realtimeMessagePersistor?(Self.mutation(for: apiMessage, content: msg.content))
        _messagesDidChange.send(msg.conversationId)
        // If the edited message is the conversation's last message, the list-row
        // preview still shows the pre-edit text — refresh it in place.
        await refreshLastMessagePreviewIfEdited(
            conversationId: msg.conversationId, messageId: msg.id, newContent: msg.content)
    }

    private func handleDeletedMessage(_ event: MessageDeletedEvent) async {
        let callId = await cache.messages.load(for: event.conversationId).snapshot()?
            .first(where: { $0.id == event.messageId })?.callSummary?.callId

        let deletedAt = Date()
        await cache.messages.upsertPatch(for: event.conversationId, itemId: event.messageId) { msg in
            msg.deletedAt = deletedAt
            msg.content = ""
        }
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

    /// Updates a conversation row's `lastMessagePreview` when the edited message
    /// is that row's `lastMessageId`. No-op otherwise (editing an older message
    /// leaves the preview untouched). Fires `_conversationsDidChange` only when a
    /// row actually changed.
    ///
    /// Une édition garde le MÊME message : l'auteur, les pièces jointes et les
    /// drapeaux éphémères restent vrais, et ce chemin n'y touche pas. Seule la
    /// carte du Prisme devient fausse — elle traduit le texte remplacé — et
    /// c'est celle que le résolveur préfère.
    private func refreshLastMessagePreviewIfEdited(
        conversationId: String, messageId: String, newContent: String
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
            }
            return updated
        }
        _conversationsDidChange.send()
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
        let newLast = Self.mostRecentSurvivor(in: messages, excluding: deletedMessageId)
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == conversationId }) {
                if let newLast {
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
                } else {
                    // The deleted message was the conversation's ONLY message — there
                    // is no survivor to surface. Clear the stale preview so the list
                    // row stops showing the deleted message's text (displayed ≠ real).
                    //
                    // Même geste que celui qu'applique `ConversationStore.merging`
                    // quand le SERVEUR annonce « plus aucun message visible »
                    // (`LastMessageIdentity.replaced(nil)`) : c'est le même fait,
                    // découvert localement au lieu d'être reçu. Le vidage à la main
                    // qui vivait ici ne touchait que le texte et l'id, laissant la
                    // pastille de pièce jointe, l'épingle de position et le libellé
                    // « Message expiré » décrire le message supprimé.
                    updated[idx].clearLastMessage()
                }
            }
            return updated
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
        await cache.messages.upsertPatch(for: convId, itemId: event.messageId) { msg in
            if !msg.reactions.contains(where: { $0.emoji == reaction.emoji && $0.participantId == reaction.participantId }) {
                msg.reactions.append(reaction)
            }
        }
        await realtimeMessagePersistor?(.reactionAdded(
            messageId: event.messageId,
            reactionId: reaction.id,
            emoji: event.emoji,
            participantId: event.participantId,
            maxCount: event.aggregation?.count
        ))
        _messagesDidChange.send(convId)
    }

    private func handleReactionRemoved(_ event: ReactionUpdateEvent) async {
        guard let convId = event.conversationId else { return }
        await cache.messages.upsertPatch(for: convId, itemId: event.messageId) { msg in
            msg.reactions.removeAll { $0.emoji == event.emoji && $0.participantId == event.participantId }
        }
        await realtimeMessagePersistor?(.reactionRemoved(
            messageId: event.messageId,
            emoji: event.emoji,
            participantId: event.participantId
        ))
        _messagesDidChange.send(convId)
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
                    updated.reactions = reactions.flatMap { agg in
                        let pids = agg.participantIds ?? []
                        return (0..<agg.count).map { index in
                            let pid: String? = index < pids.count ? pids[index] : nil
                            return MeeshyReaction(
                                messageId: messageId,
                                participantId: pid,
                                emoji: agg.emoji
                            )
                        }
                    }
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
        let effectiveUnread = (event.conversationId == currentlyOpenConversationId)
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

        // Update delivery status of own messages in the message cache.
        // WhatsApp-style all-or-nothing: the double-gray "delivered" / indigo
        // "read" indicator must represent EVERY recipient, never a single member
        // of a group. `summary.totalMembers` is the active recipient count
        // (sender excluded); a 0 denominator falls back to legacy "any > 0" so
        // 1:1 keeps working.
        let summary = event.summary
        let newStatus = DeliveryStatusResolver.fromCounts(
            deliveredCount: summary.deliveredCount,
            readCount: summary.readCount,
            recipientCount: summary.totalMembers
        )

        await cache.messages.update(for: event.conversationId) { messages in
            Self.applyReadReceipt(
                to: messages,
                newStatus: newStatus,
                deliveredCount: summary.deliveredCount,
                readCount: summary.readCount,
                frontier: event.updatedAt
            )
        }
        _messagesDidChange.send(event.conversationId)
    }

    /// Applies a read/deliver-status update to the sender's own messages, gated
    /// by the read frontier `frontier` (the event's `updatedAt`). A message
    /// created AFTER the recipient's read/deliver moment cannot have been
    /// read/delivered yet, so it must NOT advance to `.read`/`.delivered` —
    /// otherwise a message sent right after the peer read would falsely render
    /// the double-check / "Lu". Iterates newest-first: messages beyond the
    /// frontier are skipped, the monotonic guard only advances a status that is
    /// genuinely better, and once an already-`.read` message is reached every
    /// older one is read too. Pure + testable.
    nonisolated static func applyReadReceipt(
        to messages: [MeeshyMessage],
        newStatus: MeeshyMessage.DeliveryStatus,
        deliveredCount: Int,
        readCount: Int,
        frontier: Date
    ) -> [MeeshyMessage] {
        var updated = messages
        for i in updated.indices.reversed() {
            guard updated[i].isMe else { continue }
            if updated[i].createdAt > frontier { continue }
            let current = updated[i].deliveryStatus
            if current == .read { break }
            if newStatus.isBetterThan(current) {
                updated[i].deliveryStatus = newStatus
                updated[i].deliveredCount = deliveredCount
                updated[i].readCount = readCount
            }
        }
        return updated
    }

    /// Classe un `message:edited` : un message porteur d'un résumé d'appel
    /// décrit la fin de l'appel, pas une édition utilisateur. Le confondre avec
    /// `.edited` poserait « modifié » sur un avis d'appel et écraserait le
    /// résumé — même distinction que `ConversationSocketHandler` applique déjà
    /// sur la conversation ouverte. Pure + testable.
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
                editedAt: apiMessage.editedAt ?? Date()
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
