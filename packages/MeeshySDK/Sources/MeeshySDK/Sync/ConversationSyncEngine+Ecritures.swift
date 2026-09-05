import Foundation
import Combine
import os

// ConversationSyncEngine — les ÉCRITURES : cycle de vie persisté, local-first, réconciliation du non-lu.
// Voir la note d'extraction en tête de `ConversationSyncEngine.swift` (#4172).

extension ConversationSyncEngine {
    // MARK: - Conversation lifecycle (persisted)

    /// `conversation:updated` relayed into the PERSISTED list. The RAM
    /// `ConversationStore` already applied it (via `ConversationStoreSocketBridge`)
    /// but nothing wrote it to disk: a rename received while the list screen was
    /// gone came back to its old title on the next cold start.
    ///
    /// The merge runs INSIDE the cache mutation closure so a concurrent
    /// `userState` write (read receipt, pin) can't be clobbered by a row rebuilt
    /// from a pre-read snapshot. The pre-read exists only to skip the write —
    /// and the `_conversationsDidChange` fan-out — when nothing changed.
    /* partagé entre les fichiers du moteur (#4172) */ func handleConversationUpdated(_ event: ConversationUpdatedEvent) async {
        let storeEvent = ConversationStoreSocketBridge.mapConversationUpdated(event)
        let list = await cache.conversations.load(for: "list").snapshot() ?? []
        guard Self.applyingConversationUpdate(storeEvent, to: list) != nil else { return }
        await cache.conversations.update(for: "list") { conversations in
            Self.applyingConversationUpdate(storeEvent, to: conversations) ?? conversations
        }
        _conversationsDidChange.send()
    }

    /// Apply a `conversation:updated` payload to a cached list, returning `nil`
    /// when the event changes nothing. Delegates the per-row rule to
    /// `ConversationStore.merging` so the persisted list and the RAM store can
    /// never disagree. Re-sorts only when `lastMessageAt` moved — the cache
    /// invariant is "sorted by `lastMessageAt` DESC" (cf. `saveSorted`), and
    /// `sorted(by:)` is not stable, so re-sorting on a metadata-only change
    /// would shuffle rows sharing a timestamp for nothing.
    nonisolated static func applyingConversationUpdate(
        _ event: ConversationUpdatedStoreEvent,
        to conversations: [MeeshyConversation]
    ) -> [MeeshyConversation]? {
        guard let index = conversations.firstIndex(where: { $0.id == event.conversationId }),
              let merged = ConversationStore.merging(conversations[index], with: event)
        else { return nil }
        var updated = conversations
        updated[index] = merged
        guard merged.lastMessageAt != conversations[index].lastMessageAt else { return updated }
        return updated.sorted { $0.lastMessageAt > $1.lastMessageAt }
    }

    /// `user:updated` relayed into the PERSISTED list. Le store RAM l'applique
    /// déjà via `ConversationStoreSocketBridge` ; sans ce relais, un contact
    /// renommé pendant que l'écran de liste était fermé retrouvait son ancien
    /// nom au prochain démarrage à froid.
    ///
    /// Même découpage que `handleConversationUpdated` : la fusion tourne DANS
    /// la fermeture de mutation pour ne pas écraser une écriture `userState`
    /// concurrente, et la pré-lecture ne sert qu'à éviter l'écriture — et le
    /// fan-out `_conversationsDidChange` — quand rien ne change.
    /* partagé entre les fichiers du moteur (#4172) */ func handleUserUpdated(_ event: UserUpdatedEvent) async {
        let list = await cache.conversations.load(for: "list").snapshot() ?? []
        guard Self.applyingUserUpdate(event, to: list) != nil else { return }
        await cache.conversations.update(for: "list") { conversations in
            Self.applyingUserUpdate(event, to: conversations) ?? conversations
        }
        _conversationsDidChange.send()
    }

    /// Apply a `user:updated` payload to a cached list, returning `nil` when it
    /// changes nothing. Delegates the per-row rule to
    /// `ConversationStore.merging(_:withUserUpdate:)` — même raison que son
    /// jumeau ci-dessus : la liste persistée et le store RAM ne peuvent pas
    /// diverger sur ce que l'événement VEUT DIRE.
    ///
    /// Aucun tri : une identité de contact ne touche jamais `lastMessageAt`, et
    /// `sorted(by:)` n'étant pas stable, re-trier brasserait pour rien les
    /// lignes qui partagent un horodatage.
    nonisolated static func applyingUserUpdate(
        _ event: UserUpdatedEvent,
        to conversations: [MeeshyConversation]
    ) -> [MeeshyConversation]? {
        var updated = conversations
        var changed = false
        for index in updated.indices {
            guard let merged = ConversationStore.merging(updated[index], withUserUpdate: event) else { continue }
            updated[index] = merged
            changed = true
        }
        return changed ? updated : nil
    }

    /// `conversation:deleted` relayed into the PERSISTED list. Without it the
    /// row survived on disk and the next cold start resurrected a conversation
    /// the server no longer knows — inopenable, and only killed by a manual
    /// pull-to-refresh. Its message cache goes with it, mirroring the removal
    /// path of `deltaSyncCore`.
    /* partagé entre les fichiers du moteur (#4172) */ func handleConversationDeleted(_ event: ConversationDeletedSocketEvent) async {
        let list = await cache.conversations.load(for: "list").snapshot() ?? []
        guard list.contains(where: { $0.id == event.conversationId }) else { return }
        await cache.conversations.update(for: "list") { conversations in
            conversations.filter { $0.id != event.conversationId }
        }
        await cache.messages.invalidate(for: event.conversationId)
        _conversationsDidChange.send()
        await recomputeTotalUnread()
    }

    /// `conversation:restored` — la jumelle MONTANTE (#4389).
    ///
    /// La ligne revient dans le cache persisté par une lecture BORNÉE
    /// (`GET /conversations/:id`), jamais par un rechargement de liste : c'est
    /// la même règle que côté RAM et que côté web. Une lecture qui échoue ne
    /// fabrique rien — la liste reste telle quelle, et la prochaine synchro
    /// rattrapera.
    ///
    /// Idempotent : si la ligne est déjà présente (une autre voie l'a
    /// ramenée), elle est remplacée par la version fraîche plutôt que
    /// dupliquée.
    /* partagé entre les fichiers du moteur (#4172) */ func handleConversationRestored(_ event: ConversationRestoredSocketEvent) async {
        // `conversationService` est déjà une couture de ce moteur — pas de
        // dépendance neuve, et le double des tests la contrôle déjà.
        // `event.userId` EST le restaurateur : l'événement ne part que sur SA
        // room personnelle, donc le recevoir signifie que c'est nous, comme
        // pour la descendante juste au-dessus qui ne gate pas davantage.
        guard let api = try? await conversationService.getById(event.conversationId) else { return }
        let restored = api.toConversation(currentUserId: event.userId)
        await cache.conversations.update(for: "list") { conversations in
            conversations.filter { $0.id != restored.id } + [restored]
        }
        _conversationsDidChange.send()
        await recomputeTotalUnread()
    }

    /// `message:consumed` for a CLOSED conversation. `ConversationSocketHandler`
    /// covers the open one; without this relay a view-once media burnt on
    /// another device stayed viewable here until the next REST refetch.
    /* partagé entre les fichiers du moteur (#4172) */ func handleMessageConsumed(_ event: MessageConsumedEvent) async {
        await realtimeMessagePersistor?(.consumed(
            messageId: event.messageId,
            viewOnceCount: event.viewOnceCount
        ))
        _messagesDidChange.send(event.conversationId)
    }

    // MARK: - Local-First Updates

    /* partagé entre les fichiers du moteur (#4172) */ func handleAttachmentStatusUpdated(_ event: AttachmentStatusUpdatedEvent) async {
        // Trigger message refresh so UI can re-render attachment status indicators
        _messagesDidChange.send(event.conversationId)
    }

    /// Patches the enriched attachment fields (Whisper transcription, NLLB+TTS audio
    /// translations) into the cached `MeeshyMessage` for conversations that are not
    /// currently open. The open-conversation path is handled by `ConversationSocketHandler`
    /// which also updates the GRDB store and in-memory ViewModel dictionaries; this
    /// handler ensures the `CacheCoordinator` message cache stays consistent for every
    /// conversation, preventing stale previews after the user closes and reopens a chat.
    /* partagé entre les fichiers du moteur (#4172) */ func handleAttachmentUpdated(_ event: AttachmentUpdatedEvent) async {
        await cache.messages.upsertPatch(for: event.conversationId, itemId: event.messageId) { msg in
            guard let idx = msg.attachments.firstIndex(where: { $0.id == event.attachment.id }) else { return }
            let api = event.attachment
            if let t = api.transcription {
                msg.attachments[idx].transcription = MeeshyMessageAttachment.EmbeddedTranscription(
                    text: t.resolvedText,
                    language: t.language ?? "und",
                    confidence: t.confidence,
                    durationMs: t.durationMs,
                    speakerCount: t.speakerCount,
                    segments: t.segments?.map { s in
                        MeeshyMessageAttachment.EmbeddedTranscription.TranscriptionSegmentData(
                            text: s.text,
                            startTime: s.startTime,
                            endTime: s.endTime,
                            speakerId: s.speakerId
                        )
                    }
                )
            }
            if let translations = api.translations {
                let mapped = translations.compactMapValues { t -> MeeshyMessageAttachment.EmbeddedAudioTranslation? in
                    guard let url = t.url else { return nil }
                    return MeeshyMessageAttachment.EmbeddedAudioTranslation(
                        url: url,
                        transcription: t.transcription,
                        durationMs: t.durationMs,
                        format: t.format,
                        cloned: t.cloned,
                        quality: t.quality,
                        voiceModelId: t.voiceModelId,
                        ttsModel: t.ttsModel,
                        segments: t.segments?.map { s in
                            MeeshyMessageAttachment.EmbeddedTranscription.TranscriptionSegmentData(
                                text: s.text,
                                startTime: s.startTime,
                                endTime: s.endTime,
                                speakerId: s.speakerId
                            )
                        }
                    )
                }
                if !mapped.isEmpty {
                    msg.attachments[idx].audioTranslations = mapped
                }
            }
        }
        _messagesDidChange.send(event.conversationId)
    }

    /// `[langue: contenu]` du message, prêt pour le Prisme de la ligne de liste.
    /// Les codes sont minusculés — `resolvedLastMessagePreview` résout en
    /// minuscules et une clé « FR » ne serait jamais trouvée.
    ///
    /// **Jumeau socket de `buildLastMessagePreviewTranslations`** (gateway,
    /// `routes/conversations/utils/last-message-preview.ts`), qui sert la MÊME
    /// carte par REST. Les deux chemins alimentent une seule ligne de liste :
    /// toute exclusion présente d'un côté et absente de l'autre fait dépendre
    /// le texte affiché du transport qui l'a apporté. Les quatre exclusions et
    /// le plafond sont donc repris ici tels quels.
    ///
    /// 1. **Hors prisme du lecteur** — le résolveur n'affiche qu'UNE valeur ;
    ///    garder les N langues de la conversation n'alourdit que le cache.
    /// 2. **Langue d'origine** — elle EST déjà `lastMessagePreview`. La facette
    ///    socket transporte `lastMessageOriginalLanguage`, donc le résolveur
    ///    sert toujours l'original à SON rang (règle #3 du Prisme) sans avoir
    ///    besoin de la clé.
    /// 3. **Traduction chiffrée** — `translatedContent` est alors un
    ///    cryptogramme et la clé de déchiffrement ne transite pas par ce
    ///    chemin : la poser afficherait du base64 dans la liste, là où le même
    ///    message servi par REST retombe correctement sur l'original. C'est la
    ///    seule des quatre qui change le texte affiché.
    /// 4. **Texte inexploitable** — une entrée vide ou blanche ne décrit aucun
    ///    aperçu.
    ///
    /// Rend `nil` — jamais `[:]` — quand il ne reste rien, l'état que le
    /// résolveur distingue pour retomber sur l'original.
    static func previewTranslations(
        from apiMessage: APIMessage,
        viewerLanguages: [String]
    ) -> [String: String]? {
        guard let translations = apiMessage.translations, !translations.isEmpty else { return nil }
        let wanted = viewerLanguages.filter { !$0.isEmpty }.map { $0.lowercased() }
        guard !wanted.isEmpty else { return nil }
        let original = apiMessage.originalLanguage?.lowercased()

        var out: [String: String] = [:]
        for target in wanted {
            if let original, target == original { continue }
            if out[target] != nil { continue }
            // `last(where:)` conserve la règle « la dernière entrée gagne » du
            // `uniquingKeysWith` d'origine, pour un payload qui répéterait une
            // langue.
            guard let match = translations.last(where: { $0.targetLanguage.lowercased() == target })
            else { continue }
            guard match.isEncrypted != true else { continue }
            let text = match.translatedContent
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            out[target] = text.meeshyPreviewTruncated
        }

        return out.isEmpty ? nil : out
    }

    /// Applique la facette du message qu'on vient d'envoyer, AVANT tout écho
    /// serveur. La ligne montre donc immédiatement l'auteur, la pièce jointe et
    /// les effets du message réellement envoyé — et non ceux du précédent.
    public func updateConversationAfterSend(_ facet: LastMessageFacet, conversationId: String) async {
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == conversationId }) {
                updated[idx].applyLastMessage(facet)
                updated[idx].userState.unreadCount = 0
                // Envoyer, c'est avoir lu : la frontière avance au-delà du
                // message qu'on vient de poser, sinon `reconcileUnread` la
                // trouverait périmée face au nouveau `lastMessageAt`.
                updated[idx].userState.lastReadAt = Date()
                let conv = updated.remove(at: idx)
                updated.insert(conv, at: 0)
            }
            return updated
        }
        _conversationsDidChange.send()
        await recomputeTotalUnread()
    }

    public func markConversationReadLocally(_ conversationId: String) async {
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == conversationId }) {
                updated[idx].userState.unreadCount = 0
                // Frontière de lecture locale — lue par `reconcileUnread` pour
                // qu'un instantané serveur en retard sur l'accusé de lecture
                // (outbox encore pleine, hors-ligne, 429) ne rallume pas la
                // pastille.
                updated[idx].userState.lastReadAt = Date()
            }
            return updated
        }
        _conversationsDidChange.send()
        await recomputeTotalUnread()
    }

    /// Symétrique de `markConversationReadLocally` : « marquer comme non lu »
    /// EFFACE la frontière de lecture, sinon `reconcileUnread` ramènerait le
    /// compteur à 0 au prochain instantané et le geste serait sans effet.
    public func markConversationUnreadLocally(_ conversationId: String) async {
        await cache.conversations.update(for: "list") { conversations in
            var updated = conversations
            if let idx = updated.firstIndex(where: { $0.id == conversationId }) {
                updated[idx].userState.lastReadAt = nil
                if updated[idx].userState.unreadCount == 0 {
                    // Le serveur reste autoritatif sur le compte exact ; on pose
                    // localement ≥ 1 pour que la pastille apparaisse tout de suite.
                    updated[idx].userState.unreadCount = 1
                }
            }
            return updated
        }
        _conversationsDidChange.send()
        await recomputeTotalUnread()
    }

    // MARK: - Réconciliation du non-lu

    /// Réconcilie un instantané serveur avec la frontière de lecture LOCALE.
    ///
    /// Le gateway ne renvoie jamais `lastReadAt` (`APIConversation.toConversation`
    /// ne le mappe pas) : ce champ est donc une frontière purement locale, posée
    /// par `markConversationReadLocally` et par l'entrée dans une conversation,
    /// et qui survit au round-trip GRDB. Deux règles, dans cet ordre :
    ///
    /// 1. **Conversation ouverte** → 0. L'utilisateur la REGARDE ; tout compteur
    ///    non nul est un mensonge visuel. Même gate que `handleUnreadUpdated`,
    ///    qui l'appliquait déjà aux broadcasts socket mais pas aux syncs REST.
    /// 2. **Lecture locale postérieure au dernier message connu du serveur** → 0.
    ///    Le compteur serveur est en retard (accusé de lecture encore dans
    ///    l'outbox, hors-ligne, 429…). Dès qu'un message VRAIMENT plus récent
    ///    arrive, `lastMessageAt` repasse devant la frontière et le compteur
    ///    serveur reprend la main — la règle se répare donc toute seule et ne
    ///    peut pas masquer durablement un vrai non-lu.
    ///
    /// La frontière locale est toujours préservée (le serveur ne la porte pas),
    /// ce qui laisse `markAsUnread` — qui l'efface — survivre au prochain sync.
    ///
    /// Règle UNIQUE du non-lu local : `ConversationStore.hydrateMetadata`
    /// applique CETTE fonction, et non une variante à lui. Le store RAM et le
    /// cache disque ne peuvent donc pas diverger sur ce qu'« ouverte » ou
    /// « déjà lue » veut dire — c'était la source du va-et-vient 0 ↔ 99 :
    /// le cache réconcilié disait 0, le store republiait 99, et la ligne
    /// affichait celui des deux qui avait émis en dernier.
    public nonisolated static func reconcileUnread(
        incoming: MeeshyConversation,
        local: MeeshyConversation?,
        openConversationId: String?,
        now: Date = Date()
    ) -> MeeshyConversation {
        var result = incoming
        // La frontière ne voyage que localement : la reprendre du cache est la
        // seule façon qu'elle traverse l'écrasement par l'instantané serveur.
        //
        // MAX et non `local ?? incoming` : sur le chemin serveur, `incoming` ne
        // porte jamais de frontière et les deux formes coïncident ; sur le
        // chemin store (`hydrateMetadata`, où `incoming` EST le cache, qui en
        // porte une) la forme `??` ferait RECULER une frontière que le cache
        // vient d'avancer. Une frontière de lecture est monotone partout
        // ailleurs (`applyReadReceipt`) — elle doit l'être ici aussi.
        result.userState.lastReadAt = [
            local?.userState.lastReadAt, incoming.userState.lastReadAt
        ].compactMap { $0 }.max()

        if incoming.id == openConversationId {
            result.userState.unreadCount = 0
            result.userState.lastReadAt = max(result.userState.lastReadAt ?? .distantPast, now)
            return result
        }

        if let frontier = result.userState.lastReadAt, frontier >= incoming.lastMessageAt {
            result.userState.unreadCount = 0
        }
        return result
    }

    /// Variante par lot — applique la règle ci-dessus à chaque ligne entrante en
    /// la confrontant à son homologue en cache.
    public nonisolated static func reconcileUnread(
        incoming: [MeeshyConversation],
        existing: [MeeshyConversation],
        openConversationId: String?,
        now: Date = Date()
    ) -> [MeeshyConversation] {
        guard !incoming.isEmpty else { return incoming }
        let localById = Dictionary(existing.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return incoming.map {
            reconcileUnread(
                incoming: $0,
                local: localById[$0.id],
                openConversationId: openConversationId,
                now: now
            )
        }
    }

    /// Reads the authoritative cache for the conversation list, refreshes the
    /// synchronous per-conversation mirror, and republishes the aggregate.
    /// Cheap: one cache read + a linear reduce; runs only when a mutation
    /// likely changed the total.
    /* partagé entre les fichiers du moteur (#4172) */ func recomputeTotalUnread() async {
        let cached = await cache.conversations.load(for: "list").snapshot() ?? []
        let mirror = Dictionary(
            cached.map { ($0.id, $0.userState.unreadCount) },
            uniquingKeysWith: { first, _ in first }
        )
        stateQueue.sync { _unreadByConversation = mirror }
        publishTotalUnread()
    }

    /// Sums the mirror, excluding the currently-open conversation — les
    /// surfaces inter-conversations (pastille du bouton retour, menus
    /// latéraux) ne comptent QUE les autres. Clamp ≥ 0 contre un compteur
    /// serveur aberrant.
    ///
    /// SYNCHRONE, et c'est tout l'intérêt : `setCurrentlyOpenConversation`
    /// pose le gate puis republie ICI, dans le même tour de boucle, AVANT le
    /// `Task` qui va écrire le cache. Sans ce miroir, l'agrégat restait à sa
    /// valeur d'AVANT l'ouverture (un `CurrentValueSubject` rejoue sa dernière
    /// valeur à l'abonnement) et `ConversationViewModel.start()`, qui s'abonne
    /// juste après, recevait le total INCLUANT la conversation qu'on vient
    /// d'ouvrir : la pastille affichait « 99 » puis retombait — le glitch.
    /* partagé entre les fichiers du moteur (#4172) */ func publishTotalUnread() {
        let (mirror, openId) = stateQueue.sync { (_unreadByConversation, _currentlyOpenConversationId) }
        let total = mirror.reduce(0) { acc, entry in
            guard entry.key != openId else { return acc }
            return acc + max(0, entry.value)
        }
        _totalConversationsUnread.send(total)
    }

}
