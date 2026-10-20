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
// Responsabilité tenue ici : ENVOYER — le garde-temps du POST REST, la
// déduplication du double-tap, l'insert optimiste GRDB, le chemin socket-first
// puis REST puis repli socket, la finalisation partagée à l'ACK
// (`finalizeSuccessfulSend`), le journal des tentatives, le renvoi d'un message
// en échec et la bulle optimiste d'un média. Un seul invariant gouverne le
// tout : des messages DISTINCTS partent en parallèle, seul le MÊME message
// refiré dans la fenêtre de debounce est refusé.

// MARK: - Send Timeout Helper

/// Caps an awaited async operation at `seconds`. On expiry the operation's
/// task is cancelled, so a hung/slow REST send (typical on cellular) throws
/// promptly instead of holding the optimistic `.sending` clock for the full
/// URLSession `timeoutIntervalForRequest` (60s) before the socket/outbox
/// fallback can take over. The send catch path re-emits with the SAME
/// `clientMessageId`, so the gateway dedups — no duplicate row even if the
/// cancelled POST actually landed server-side.
@MainActor
func withSendTimeout<T: Sendable>(
    seconds: Double,
    operation: @escaping () async throws -> T
) async throws -> T {
    let operationTask = Task { try await operation() }
    let watchdog = Task {
        try? await Task.sleep(for: .seconds(max(0, seconds)))
        operationTask.cancel()
    }
    defer { watchdog.cancel() }
    return try await operationTask.value
}

extension ConversationViewModel {

    // MARK: - La protection armée au composeur

    /// Ce que la rangée du composeur affiche comme ARMÉ, lu en UNE valeur.
    ///
    /// Les trois bascules restent des `@Published` distincts parce que la
    /// rangée s'y lie une par une ; mais tout ce qui ENVOIE lit cette valeur,
    /// jamais les trois champs. C'est ce qui rend impossible qu'un chemin
    /// d'envoi n'en applique que deux sur trois.
    var armedProtection: MessageProtectionIntent {
        MessageProtectionIntent(
            ephemeral: ephemeralChoice,
            isBlurred: isBlurEnabled,
            isViewOnce: isViewOnceEnabled
        )
    }

    /// Saisit la protection armée, une fois par tap, AVANT que quoi que ce soit
    /// parte : la valeur rendue voyage ensuite jusqu'à chaque message de cet
    /// envoi (#7498 — un envoi multi-pièces ne peut pas perdre sa protection
    /// en route).
    ///
    /// **Elle ne DÉSARME plus rien** (#8305, directive porteur 2026-09-27) : une
    /// protection armée reste armée pour les messages suivants de la
    /// conversation jusqu'à ce qu'on la change. Seuls les effets décoratifs
    /// restent à usage unique (`finalizeSuccessfulSend`).
    ///
    /// La contagion de la citation (#8557) s'y applique : tout ce qui part de
    /// ce tap — ligne optimiste, corps REST, file hors ligne — porte les bits
    /// que le message cité impose.
    func captureArmedProtection(replyingTo replyToId: String?) -> MessageProtectionIntent {
        contaminated(armedProtection, replyingTo: replyToId)
    }

    /// Les bits que la ligne OPTIMISTE doit porter : l'axe apparition/persistant
    /// choisi au composeur, UNI à l'axe cycle de vie de la protection armée.
    ///
    /// Le serveur, lui, RECOMPOSE (`composeMessageEffectFlags`) depuis les
    /// colonnes déclarées — la charge REST n'a donc rien à unir, et c'est
    /// précisément ce qui a caché le défaut. La ligne LOCALE n'a pas cette
    /// chance : elle est lue telle quelle par la bulle, et
    /// `MessageProtectionDescriptor` lit les BITS pour la vue unique et le
    /// flou. Sans cette union, un texte armé « ① » n'avait ni puce ni voile
    /// jusqu'à la réponse serveur — l'éphémère s'en sortait par la porte de
    /// derrière (`expiresAt` suffit à le prouver), ses deux voisins non.
    func optimisticEffectFlags(_ intent: MessageProtectionIntent) -> MessageEffectFlags {
        let apparence: MessageEffectFlags = pendingEffects.hasAnyEffect ? pendingEffects.flags : MessageEffectFlags(rawValue: 0)
        return apparence.union(intent.lifecycleFlags)
    }

    /// Le `effectFlags` du corps REST : l'axe apparition/persistant choisi au
    /// composeur, uni aux bits de protection qu'aucune colonne ne porte — la
    /// flamme-œil (#8303). `nil` quand il n'y a rien, comme avant.
    func wireEffectFlags(_ intent: MessageProtectionIntent) -> UInt32? {
        let apparence: MessageEffectFlags = pendingEffects.hasAnyEffect ? pendingEffects.flags : []
        let bits = apparence.union(intent.wireEffectFlags)
        return bits.isEmpty ? nil : bits.rawValue
    }

    // MARK: - Délai de garde de l'envoi REST

    /// REST send timeout (seconds). Far below `APIClient.timeoutIntervalForRequest`
    /// (60s): a slow/failing POST must fall through to the socket fallback +
    /// durable outbox quickly instead of pinning the optimistic `.sending`
    /// clock for a full minute on a single hung cellular attempt.
    static let sendRESTTimeoutSeconds: Double = 12

    // MARK: - Send Message

    /// Langue de composition : détectée depuis le contenu (on-device), repli sur la
    /// langue primaire de l'utilisateur puis "fr". Pure → testable sans authManager.
    nonisolated static func composeLanguage(for content: String, preferred: [String]) -> String {
        LanguageDetection.detectLanguageCode(for: content, fallback: preferred.first)
            ?? preferred.first ?? "fr"
    }

    /// Shared post-ACK finalization for a successful send, used by BOTH the
    /// socket-first fast path and the REST path so the two stay in lockstep:
    /// records the tempId→serverId mapping, drives the `.serverAck` state
    /// transition (⏱→✓), bumps the conversation to the top, persists the
    /// server-id mapping for cold-start reconciliation, and clears the
    /// ephemeral/blur/effect compose state + mention draft. `transport` only
    /// tags the perf signpost (`perf:ios.send.ack ... transport=…`) so a device
    /// trace can A/B socket-first vs rest.
    private func finalizeSuccessfulSend(
        tempId: String,
        serverId: String,
        serverCreatedAt: Date,
        text: String,
        sendStartedAt: Date,
        transport: String
    ) async {
        // Register tempId → serverId so the `message:new` broadcast reconciles
        // without creating a duplicate row. UI update (sent state) flows through
        // persistence → store observation.
        pendingServerIds[tempId] = serverId

        // GRDB server ack — state machine transitions to .sent. `try?` swallows
        // both errors AND a nil return (state machine rejected / record missing),
        // logged so the ⏱→✓ transition is observable.
        let persistence = messagePersistence
        let ackResult = (await bestEffort("send.serverAck", category: .messages) {
            try await persistence.applyEvent(
                localId: tempId,
                event: .serverAck(serverId: serverId, at: serverCreatedAt)
            )
        }) ?? nil
        Logger.messages.info("SendFlow PENDING->SENT tempId=\(tempId, privacy: .public) serverId=\(serverId, privacy: .public) resultState=\(ackResult.map { String(describing: $0) } ?? "nil", privacy: .public) transport=\(transport, privacy: .public)")
        let ackElapsedMs = Int(Date().timeIntervalSince(sendStartedAt) * 1000)
        Logger.messages.info("perf:ios.send.ack clientMessageId=\(tempId, privacy: .public) serverId=\(serverId, privacy: .public) transport=\(transport, privacy: .public) durationMs=\(ackElapsedMs, privacy: .public)")

        let convId = conversationId
        let msgContent = text
        let msgTime = serverCreatedAt

        // Persist server-id mapping so a cold-start REST fetch reconciles without
        // duplicate temp_…/server-id pairs.
        Task { [weak self] in
            await self?.persistMessagesUsingServerIds()
        }
        // Facette relue sur la ligne optimiste : elle porte les pièces jointes et
        // les effets réellement envoyés. Recomposer une facette « texte nu » ici
        // effacerait de la liste la photo qu'on vient d'envoyer, une seconde
        // après que l'insert optimiste l'y a mise.
        let ackedFacet = messages.first(where: { $0.id == tempId }).map {
            LastMessageFacet(message: $0, preview: msgContent, id: serverId, at: msgTime)
        } ?? LastMessageFacet.sent(id: serverId, text: msgContent, at: msgTime)
        Task {
            await ConversationSyncEngine.shared.updateConversationAfterSend(
                ackedFacet, conversationId: convId, replacing: [tempId]
            )
        }

        // Les TROIS protections ne se désarment NI ici NI au tap (#8305) :
        // elles restent armées jusqu'à ce qu'on les change. Seuls les effets
        // décoratifs sont à usage unique — et c'est à l'ACQUITTEMENT qu'ils
        // tombent, jamais avant (#7498 : un tap produit plusieurs messages).
        if pendingEffects.hasAnyEffect { pendingEffects = .none }
        mentionController.clearDraft()

        // #5218 — LE moment où la permission de notification a un sens pour un
        // compte fraîchement créé : il vient de parler à quelqu'un, donc il a
        // quelque chose à recevoir. `MeeshyApp` a posé le marqueur au lieu de
        // demander à l'ouverture (`PushPermissionDeferral`) ; ici on l'honore
        // une fois, et le marqueur disparaît.
        //
        // Ce site est le point de passage des DEUX transports acquittés par le
        // serveur (socket-first et REST) : le placer dans `sendMessage`, qui a
        // quatre `return true` dont un pour la simple mise en file HORS LIGNE,
        // demanderait la permission pour un message qui n'est pas encore parti.
        //
        // Détaché : la demande ouvre une alerte système qui peut rester à
        // l'écran indéfiniment, et rien de l'envoi ne doit l'attendre.
        Task { await PushPermissionPrompt.honourDeferredRequest() }
    }

    @discardableResult
    /// `attachmentReplyTo` — l'ANCRE de la pièce citée (#6164, moitié ÉCRITURE).
    ///
    /// Elle n'a de sens qu'avec `replyToId` : la garde serveur
    /// (`admitAttachmentReply`) refuse une pièce sans son message, et relit la
    /// ligne pour vérifier l'appartenance.
    ///
    /// **Sa présence CHANGE DE TRANSPORT.** Le canal socket ne la porte pas —
    /// `MessageHandler.ts` ne lit `attachmentReplyTo` nulle part et
    /// `admitAttachmentReply` n'y est pas wiré. Un envoi qui la porte est donc
    /// inéligible au socket-first ET au repli socket (`OutgoingMessage
    /// .socketFirstEligible`, `.socketFallbackEligible`), exactement comme le
    /// chiffrement, l'éphémère, la vue unique, le flou et les effets.
    func sendMessage(content: String, replyToId: String? = nil, storyReplyToId: String? = nil, storyReplyReference: ReplyReference? = nil, forwardedFromId: String? = nil, forwardedFromConversationId: String? = nil, attachmentIds: [String]? = nil, localAttachments: [MeeshyMessageAttachment]? = nil, protection: MessageProtectionIntent? = nil, originalLanguage: String? = nil, existingTempId: String? = nil, location: SharedPlace? = nil, sticker: MessageSticker? = nil, attachmentReplyTo: QuotedAttachmentSend? = nil) async -> Bool {
        let outgoing = OutgoingMessage(
            conversationId: ConversationID(conversationId),
            content: content,
            relation: .legacy(
                replyToId: replyToId,
                storyReplyToId: storyReplyToId,
                storyReference: storyReplyReference,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                attachmentReplyTo: attachmentReplyTo
            ),
            attachments: OutgoingAttachments(ids: attachmentIds, previews: localAttachments),
            protection: protection,
            originalLanguage: originalLanguage,
            reusedClientMessageId: existingTempId.map { MessageID($0) },
            location: location,
            sticker: sticker
        )
        if case .success = await send(outgoing) { return true }
        return false
    }

    // MARK: - Les étapes de l'envoi

    /// L'envoi d'un `OutgoingMessage`, étape par étape : valider, poser la
    /// ligne (hors ligne ou optimiste), sceller, émettre, réconcilier.
    ///
    /// Le verrou `inFlightSendCount` couvre toutes les étapes : des messages
    /// DISTINCTS partent en parallèle, aucun contenu n'est dédoublonné (#7985)
    /// — la seule clé de déduplication est le `clientMessageId`.
    func send(_ outgoing: OutgoingMessage) async -> Result<SentMessageReceipt, SendFailure> {
        Logger.messages.info("SendFlow enter convId=\(self.conversationId, privacy: .public) textLen=\(outgoing.text.count, privacy: .public) attachmentIds=\((outgoing.attachments.ids ?? []).count, privacy: .public) existingTempId=\(outgoing.reusedClientMessageId?.rawValue ?? "nil", privacy: .public) isSending=\(self.isSending, privacy: .public)")
        if let failure = validate(outgoing) { return .failure(failure) }

        inFlightSendCount += 1
        isSending = true
        Logger.messages.info("SendFlow LOCK inFlight=\(self.inFlightSendCount, privacy: .public) convId=\(self.conversationId, privacy: .public) textLen=\(outgoing.text.count, privacy: .public)")
        defer {
            inFlightSendCount = max(0, inFlightSendCount - 1)
            isSending = inFlightSendCount > 0
            Logger.messages.info("SendFlow UNLOCK inFlight=\(self.inFlightSendCount, privacy: .public) convId=\(self.conversationId, privacy: .public)")
        }

        socketHandler?.stopTypingEmission()

        let intent = contaminated(outgoing.protection ?? armedProtection, replyingTo: outgoing.relation.replyToId)
        guard networkMonitor.isOnline else {
            return await stageOffline(outgoing, intent: intent)
        }

        let context = makeSendContext(outgoing, intent: intent)
        await stageOptimistic(outgoing, context: context)
        let payload = await prepareUpload(outgoing, context: context)
        let outcome: Result<SentMessageReceipt, any Error>
        do {
            outcome = .success(try await emit(outgoing, payload: payload, context: context))
        } catch {
            outcome = .failure(error)
        }
        return await reconcile(outcome, outgoing: outgoing, payload: payload, context: context)
    }

    /// Garde d'éligibilité partagée avec le composeur (`SendEligibility`) : un
    /// message « lieu seul » est un envoi valide. Le geste du jour (#5902) et
    /// le rejeu de la flamme ne se posent que pour un message qui PART — par le
    /// réseau ou par l'outbox.
    func validate(_ outgoing: OutgoingMessage) -> SendFailure? {
        guard SendEligibility.canSend(text: outgoing.text, attachmentIds: outgoing.attachments.ids ?? [], location: outgoing.location) else {
            Logger.messages.error("SendFlow EARLY-RETURN guard=emptyContent convId=\(self.conversationId, privacy: .public)")
            return .ineligible
        }
        StreakActivityMark.marquer()
        HeaderFlameReplay.messageSent(in: conversationId)
        return nil
    }

    private func composedLanguage(of outgoing: OutgoingMessage) -> String {
        outgoing.originalLanguage
            ?? ConversationViewModel.composeLanguage(for: outgoing.content, preferred: preferredLanguages)
    }

    private func makeSendContext(_ outgoing: OutgoingMessage, intent: MessageProtectionIntent) -> SendAttemptContext {
        let context = SendAttemptContext(
            clientMessageId: outgoing.reusedClientMessageId ?? MessageID(ClientMessageId.generate()),
            startedAt: Date(),
            intent: intent,
            language: composedLanguage(of: outgoing),
            reusesExistingRow: outgoing.reusedClientMessageId != nil
        )
        Logger.messages.info("perf:ios.send.start clientMessageId=\(context.clientMessageId.rawValue, privacy: .public) conversationId=\(self.conversationId, privacy: .public) existingTempId=\(context.reusesExistingRow, privacy: .public)")
        return context
    }

    // MARK: Hors ligne

    /// Hors ligne : la ligne optimiste, l'aperçu de liste, puis l'écriture
    /// AWAITED dans l'outbox. Seul l'état du réseau décide — pas celui du
    /// socket, encore en poignée de main au démarrage. Si l'outbox échoue, la
    /// bulle passe en `.failed` : l'utilisateur peut renvoyer.
    func stageOffline(_ outgoing: OutgoingMessage, intent: MessageProtectionIntent) async -> Result<SentMessageReceipt, SendFailure> {
        let clientMessageId = outgoing.reusedClientMessageId ?? MessageID(ClientMessageId.generate())
        let queueItem = outgoing.offlineQueueItem(clientMessageId: clientMessageId, intent: intent)
        let offlineMessage = await insertOfflineRow(outgoing, clientMessageId: clientMessageId, intent: intent)

        let convId = conversationId
        Task.detached(priority: .utility) {
            await CacheCoordinator.shared.messages.mergeUpdate(for: convId) { cached in
                let cachedIds = Set(cached.map(\.id))
                guard !cachedIds.contains(offlineMessage.id) else { return cached }
                return (cached + [offlineMessage]).sorted { $0.createdAt < $1.createdAt }
            }
        }

        let offlineFacet = LastMessageFacet(message: offlineMessage, preview: outgoing.text)
        Task {
            await ConversationSyncEngine.shared.updateConversationAfterSend(offlineFacet, conversationId: convId)
        }

        do {
            try await offlineQueue.enqueue(queueItem)
            Logger.messages.info("Message enqueued for offline delivery")
            return .success(SentMessageReceipt(clientMessageId: clientMessageId, delivery: .queuedOffline))
        } catch {
            Logger.messages.error("offline enqueue failed: \(error.localizedDescription, privacy: .public)")
            let persistence = messagePersistence
            let localId = clientMessageId.rawValue
            let reason = error.localizedDescription
            await bestEffort("send.offlineEnqueueFailed", category: .messages) {
                try await persistence.markOptimisticFailed(localId: localId, reason: reason)
            }
            return .failure(.offlineEnqueueFailed(reason: reason))
        }
    }

    private func insertOfflineRow(_ outgoing: OutgoingMessage, clientMessageId: MessageID, intent: MessageProtectionIntent) async -> Message {
        let localId = clientMessageId.rawValue
        let relation = outgoing.relation
        let offlineMessage = Message(
            id: localId,
            conversationId: conversationId,
            senderId: currentUserId,
            content: outgoing.text,
            messageType: .text,
            replyToId: relation.replyToId,
            forwardedFromId: relation.forwardedFromId,
            forwardedFromConversationId: relation.forwardedFromConversationId,
            createdAt: Date(),
            updatedAt: Date(),
            deliveryStatus: .sending,
            isMe: true,
            location: outgoing.location,
            sticker: outgoing.sticker
        )
        let offlineRecord = OptimisticTextRecordBuilder.record(
            localId: localId,
            conversationId: conversationId,
            senderId: currentUserId,
            sender: authManager.currentUser,
            text: outgoing.text,
            originalLanguage: composedLanguage(of: outgoing),
            messageType: "text",
            replyToId: relation.replyToId,
            storyReplyToId: relation.storyReplyToId,
            forwardedFromId: relation.forwardedFromId,
            forwardedFromConversationId: relation.forwardedFromConversationId,
            replyToJson: nil,
            effectFlags: optimisticEffectFlags(intent).rawValue,
            maxViewOnceCount: intent.maxViewOnceCount,
            locationJson: OptimisticRecordColumns.locationJson(outgoing.location, id: localId),
            stickerJson: OptimisticRecordColumns.stickerJson(outgoing.sticker, id: localId),
            now: Date(),
            ephemeralDuration: intent.ephemeralDurationSeconds
        )
        do {
            try await messagePersistence.insertOptimistic(offlineRecord)
        } catch {
            Logger.messages.error("offline insertOptimistic failed: \(error.localizedDescription, privacy: .public)")
        }
        return offlineMessage
    }

    // MARK: En ligne

    /// La ligne optimiste d'un envoi en ligne, posée dans GRDB (la
    /// observation du store la fait apparaître) puis l'aperçu de liste, avant
    /// tout ACK. Un renvoi (`reusesExistingRow`) garde sa ligne.
    func stageOptimistic(_ outgoing: OutgoingMessage, context: SendAttemptContext) async {
        guard !context.reusesExistingRow else { return }
        let tempId = context.clientMessageId.rawValue
        let intent = context.intent
        let relation = outgoing.relation
        let resolvedAttachments = outgoing.attachments.previews ?? []
        let resolvedEphemeralDuration = intent.ephemeralDurationSeconds
        let replyRef = makeReplyReference(
            storyReplyReference: relation.storyReference,
            replyToId: relation.replyToId,
            citingAttachmentId: relation.attachmentReplyTo?.attachmentId
        )
        let persistence = messagePersistence
        let optimisticRecord = OptimisticTextRecordBuilder.record(
            localId: tempId,
            conversationId: conversationId,
            senderId: currentUserId,
            sender: authManager.currentUser,
            text: outgoing.text,
            originalLanguage: context.language,
            messageType: outgoing.optimisticMessageType.rawValue,
            replyToId: relation.replyToId,
            storyReplyToId: relation.storyReplyToId,
            forwardedFromId: relation.forwardedFromId,
            forwardedFromConversationId: relation.forwardedFromConversationId,
            replyToJson: replyRef.flatMap { try? JSONEncoder().encode($0) },
            effectFlags: optimisticEffectFlags(intent).rawValue,
            maxViewOnceCount: intent.maxViewOnceCount,
            locationJson: OptimisticRecordColumns.locationJson(outgoing.location, id: tempId),
            stickerJson: OptimisticRecordColumns.stickerJson(outgoing.sticker, id: tempId),
            now: Date(),
            ephemeralDuration: resolvedEphemeralDuration
        )
        Logger.messages.info("SendFlow insertOptimistic START tempId=\(tempId, privacy: .public) convId=\(self.conversationId, privacy: .public)")
        do {
            try await persistence.insertOptimistic(optimisticRecord)
            Logger.messages.debug("SendFlow insertOptimistic OK tempId=\(tempId, privacy: .public) state=.sending convId=\(self.conversationId, privacy: .public)")
            await ConversationSyncEngine.shared.updateConversationAfterSend(
                LastMessageFacet.sent(
                    id: tempId,
                    text: outgoing.text,
                    at: optimisticRecord.createdAt,
                    attachments: resolvedAttachments,
                    isBlurred: intent.wireIsBlurred ?? false,
                    isViewOnce: intent.isViewOnce,
                    ephemeralDuration: resolvedEphemeralDuration,
                    originalLanguage: optimisticRecord.originalLanguage,
                    location: outgoing.location
                ),
                conversationId: conversationId
            )
        } catch {
            Logger.messages.error("SendFlow insertOptimistic FAILED tempId=\(tempId, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
        }
    }

    /// Prépare ce qui quitte l'appareil : le chiffrement E2EE d'une
    /// conversation directe et la requête REST. Ne lève jamais.
    ///
    /// #8221 — une session E2EE indisponible (pair sans bundle Signal) n'est
    /// PAS un envoi raté : le message part en clair, dans tous les builds.
    func prepareUpload(_ outgoing: OutgoingMessage, context: SendAttemptContext) async -> SealedOutgoingPayload {
        var content: String? = outgoing.text.isEmpty ? nil : outgoing.text
        var isEncrypted = false
        var encryptionMode: String? = nil
        if isDirect, let targetUserId = participantUserId, let textContent = content {
            do {
                let encrypted = try await messageEncryptor.encryptMessage(Data(textContent.utf8), for: targetUserId, conversationId: conversationId)
                content = encrypted.base64EncodedString()
                isEncrypted = true
                encryptionMode = "E2EE"
            } catch {
                Logger.messages.warning("E2EE session unavailable, sending in plaintext: \(error.localizedDescription, privacy: .public)")
            }
        }
        let request = outgoing.wireRequest(
            content: content,
            isEncrypted: isEncrypted,
            encryptionMode: encryptionMode,
            context: context,
            wireEffectFlags: wireEffectFlags(context.intent)
        )
        return SealedOutgoingPayload(request: request, content: content, isEncrypted: isEncrypted)
    }

    // MARK: Transport

    /// Socket-first (texte nu, socket connecté), puis REST sous délai de garde.
    /// Un échec REST est journalisé puis relancé : `reconcile` le classe.
    func emit(_ outgoing: OutgoingMessage, payload: SealedOutgoingPayload, context: SendAttemptContext) async throws -> SentMessageReceipt {
        let eligible = outgoing.socketFirstEligible(
            connected: messageSocket.isConnected,
            isEncrypted: payload.isEncrypted,
            intent: context.intent,
            hasPendingEffects: pendingEffects.hasAnyEffect
        )
        if eligible, let receipt = await emitSocketFirst(outgoing, payload: payload, context: context) {
            return receipt
        }
        return try await emitREST(payload: payload, context: context)
    }

    private func emitSocketFirst(_ outgoing: OutgoingMessage, payload: SealedOutgoingPayload, context: SendAttemptContext) async -> SentMessageReceipt? {
        let tempId = context.clientMessageId.rawValue
        Logger.messages.info("SendFlow socket-first START tempId=\(tempId, privacy: .public) convId=\(self.conversationId, privacy: .public) — message:send before REST")
        let startedAt = Date()
        if let ack = await messageSocket.sendViaSocketFallback(
            conversationId: conversationId,
            content: payload.content,
            attachmentIds: [],
            replyToId: outgoing.relation.replyToId,
            storyReplyToId: outgoing.relation.storyReplyToId,
            originalLanguage: context.language,
            isEncrypted: false,
            clientMessageId: tempId,
            location: outgoing.location
        ) {
            await recordSendAttempt(tempId, transport: .socketFirst, startedAt: startedAt, outcome: .success)
            return SentMessageReceipt(
                clientMessageId: context.clientMessageId,
                delivery: .acknowledged(serverId: MessageID(ack.messageId), at: ack.createdAt ?? Date(), via: .socketFirst)
            )
        }
        await recordSendAttempt(tempId, transport: .socketFirst, startedAt: startedAt, outcome: .failure, errorMessage: "no ACK")
        Logger.messages.info("SendFlow socket-first MISS tempId=\(tempId, privacy: .public) — no ACK, falling through to REST")
        return nil
    }

    private func emitREST(payload: SealedOutgoingPayload, context: SendAttemptContext) async throws -> SentMessageReceipt {
        let tempId = context.clientMessageId.rawValue
        Logger.messages.info("SendFlow POST /messages START tempId=\(tempId, privacy: .public) convId=\(self.conversationId, privacy: .public) — awaiting response (isSending held)")
        let startedAt = Date()
        let request = payload.request
        do {
            let response = try await withSendTimeout(seconds: ConversationViewModel.sendRESTTimeoutSeconds) {
                try await self.messageService.send(conversationId: self.conversationId, request: request)
            }
            await recordSendAttempt(tempId, transport: .rest, startedAt: startedAt, outcome: .success)
            Logger.messages.debug("SendFlow POST OK tempId=\(tempId, privacy: .public) serverId=\(response.id, privacy: .public)")
            return SentMessageReceipt(
                clientMessageId: context.clientMessageId,
                delivery: .acknowledged(serverId: MessageID(response.id), at: response.createdAt, via: .rest)
            )
        } catch {
            await recordSendAttempt(tempId, transport: .rest, startedAt: startedAt, outcome: .failure, errorMessage: error.localizedDescription)
            throw error
        }
    }

    // MARK: Réconciliation

    /// Un ACK finalise ; un échec se classe (refus définitif, repli socket,
    /// outbox).
    func reconcile(
        _ outcome: Result<SentMessageReceipt, any Error>,
        outgoing: OutgoingMessage,
        payload: SealedOutgoingPayload,
        context: SendAttemptContext
    ) async -> Result<SentMessageReceipt, SendFailure> {
        switch outcome {
        case .success(let receipt):
            await finalizeAcknowledged(receipt, outgoing: outgoing, context: context)
            return .success(receipt)
        case .failure(let error):
            return await recover(from: error, outgoing: outgoing, payload: payload, context: context)
        }
    }

    private func finalizeAcknowledged(_ receipt: SentMessageReceipt, outgoing: OutgoingMessage, context: SendAttemptContext) async {
        guard case .acknowledged(let serverId, let at, let via) = receipt.delivery else { return }
        await finalizeSuccessfulSend(
            tempId: receipt.clientMessageId.rawValue,
            serverId: serverId.rawValue,
            serverCreatedAt: at,
            text: outgoing.text,
            sendStartedAt: context.startedAt,
            transport: via.rawValue
        )
    }

    private func recover(
        from error: any Error,
        outgoing: OutgoingMessage,
        payload: SealedOutgoingPayload,
        context: SendAttemptContext
    ) async -> Result<SentMessageReceipt, SendFailure> {
        let tempId = context.clientMessageId.rawValue
        if let refusal = await classifyRefusal(error, tempId: tempId) { return .failure(refusal) }

        let failElapsedMs = Int(Date().timeIntervalSince(context.startedAt) * 1000)
        Logger.messages.warning("perf:ios.send.fail clientMessageId=\(tempId, privacy: .public) durationMs=\(failElapsedMs, privacy: .public) error=\(error.localizedDescription, privacy: .public)")

        if outgoing.socketFallbackEligible(intent: context.intent, hasPendingEffects: pendingEffects.hasAnyEffect),
           let receipt = await emitSocketFallback(outgoing, payload: payload, context: context, failedAfterMs: failElapsedMs) {
            return .success(receipt)
        }

        let persistence = messagePersistence
        await bestEffort("send.sendFailed", category: .messages) {
            try await persistence.applyEvent(localId: tempId, event: .sendFailed(error))
        }
        return .failure(await enqueueForRetry(outgoing, context: context, cause: error))
    }

    /// Refus DÉFINITIFS : retenter ne réussirait jamais, donc ni repli socket
    /// ni outbox. Un blocage entrant, lui, n'est pas visible d'avance.
    private func classifyRefusal(_ error: any Error, tempId: String) async -> SendFailure? {
        if let restriction = ConversationWriteRestriction(refusal: error), restriction.closesComposer {
            await withdrawRefusedMessage(tempId: tempId, restriction: restriction)
            return .writeRestricted(restriction)
        }
        if let slowMode = NewcomerSlowMode.from(error) {
            await holdForSlowMode(tempId: tempId, slowMode: slowMode, error: error)
            return .slowMode(slowMode)
        }
        guard error.isUserBlockedError else { return nil }
        Logger.messages.warning("perf:ios.send.fail.blocked clientMessageId=\(tempId, privacy: .public)")
        let persistence = messagePersistence
        await bestEffort("send.blockedFailed", category: .messages) {
            try await persistence.applyEvent(localId: tempId, event: .sendFailed(error))
        }
        FeedbackToastManager.shared.showError(
            String(localized: "conversation.send.blocked", defaultValue: "Vous ne pouvez pas écrire à cet utilisateur.", bundle: .main)
        )
        return .recipientBlocked
    }

    /// Repli socket : le POST REST a échoué — réémettre UNE fois avec le MÊME
    /// clientMessageId (dedup gateway). Les envois que le canal perdrait en
    /// silence restent sur le retry REST de l'outbox, qui les préserve.
    private func emitSocketFallback(
        _ outgoing: OutgoingMessage,
        payload: SealedOutgoingPayload,
        context: SendAttemptContext,
        failedAfterMs: Int
    ) async -> SentMessageReceipt? {
        let tempId = context.clientMessageId.rawValue
        Logger.messages.warning("SendFlow socket-fallback START tempId=\(tempId, privacy: .public) convId=\(self.conversationId, privacy: .public) — REST failed, awaiting socket ack up to ~10s (isSending held)")
        let startedAt = Date()
        let ack = await messageSocket.sendViaSocketFallback(
            conversationId: conversationId,
            content: payload.content,
            attachmentIds: outgoing.attachments.ids ?? [],
            replyToId: outgoing.relation.replyToId,
            storyReplyToId: outgoing.relation.storyReplyToId,
            originalLanguage: context.language,
            isEncrypted: payload.isEncrypted,
            clientMessageId: tempId,
            location: outgoing.location,
            sticker: outgoing.sticker
        )
        await recordSendAttempt(
            tempId,
            transport: .socketFallback,
            startedAt: startedAt,
            outcome: ack != nil ? .success : .failure,
            errorMessage: ack == nil ? "no ACK" : nil
        )
        guard let ack else { return nil }
        let serverId = ack.messageId
        let serverCreatedAt = ack.createdAt ?? Date()
        pendingServerIds[tempId] = serverId
        let persistence = messagePersistence
        await bestEffort("send.socketFallbackAck", category: .messages) {
            try await persistence.applyEvent(localId: tempId, event: .serverAck(serverId: serverId, at: serverCreatedAt))
        }
        Logger.messages.info("perf:ios.send.ack clientMessageId=\(tempId, privacy: .public) serverId=\(serverId, privacy: .public) transport=socket-fallback durationMs=\(failedAfterMs, privacy: .public)")
        return SentMessageReceipt(
            clientMessageId: context.clientMessageId,
            delivery: .acknowledged(serverId: MessageID(serverId), at: serverCreatedAt, via: .socketFallback)
        )
    }

    /// L'outbox unifiée (`OfflineQueue` + `OutboxFlusher`) possède la boucle de
    /// retry. L'écriture est AWAITED : si elle échoue, la bulle passe en
    /// `.failed` pour que l'utilisateur renvoie à la main.
    private func enqueueForRetry(_ outgoing: OutgoingMessage, context: SendAttemptContext, cause: any Error) async -> SendFailure {
        do {
            try await offlineQueue.enqueue(outgoing.retryQueueItem(context: context))
            return .queuedForRetry(reason: cause.localizedDescription)
        } catch {
            Logger.messages.error("online retry enqueue failed: \(error.localizedDescription, privacy: .public)")
            let persistence = messagePersistence
            let tempId = context.clientMessageId.rawValue
            let reason = "online retry enqueue failed: \(error.localizedDescription)"
            await bestEffort("send.retryEnqueueFailed", category: .messages) {
                try await persistence.markOptimisticFailed(localId: tempId, reason: reason)
            }
            return .retryEnqueueFailed(reason: reason)
        }
    }

    // MARK: - Send Attempt Journal

    /// Journalise une tentative de transport dans `send_attempts` (spec
    /// 2026-07-08 message-send-failure-retry-flow). Best-effort : un échec
    /// d'écriture ne doit jamais interrompre le flux d'envoi.
    private func recordSendAttempt(
        _ tempId: String,
        transport: SendAttemptRecord.Transport,
        startedAt: Date,
        outcome: SendAttemptRecord.Outcome,
        errorMessage: String? = nil
    ) async {
        let persistence = messagePersistence
        await bestEffort("send.recordAttempt", category: .messages) {
            try await persistence.recordSendAttempt(
                localId: tempId,
                transport: transport,
                startedAt: startedAt,
                outcome: outcome,
                errorMessage: errorMessage
            )
        }
    }

    // MARK: - Retry Failed Message

    func retryMessage(messageId: String) async {
        guard let idx = messageIndex(for: messageId) else { return }
        let failedMsg = messages[idx]
        guard failedMsg.deliveryStatus == .failed else { return }

        // Media-carrying failed messages (image/video/audio/file) must
        // replay through the durable outbox: it alone still holds the real,
        // already-uploaded attachment ids (the displayed `Message.attachments`
        // carry the pre-upload LOCAL placeholder ids, never reconciled after
        // the fact). A direct `sendMessage(content:replyToId:)` below only
        // knows content + replyToId, so a captioned media resend would land
        // on the server as text-only, and an uncaptioned one would be
        // rejected outright by `sendMessage`'s empty-content guard — leaving
        // the bubble stuck mid-clock (state already flipped .failed →
        // .queued with nothing left to advance it). Resetting the existing
        // outbox row + an immediate drain mirrors the reaction retry pattern
        // above (`OutboxFlusher` otherwise only runs at boot / foreground).
        guard failedMsg.attachments.isEmpty else {
            do {
                try await offlineQueue.retryByClientMessageId(messageId)
                // Mirror the text-only path below: flip .failed → .queued so
                // the retry band disappears immediately instead of lingering
                // for the entire upload + dispatch duration (BubbleFailedRetryBar
                // only clears once the message leaves the .failed state).
                // Gated on the reset succeeding — if the outbox row couldn't be
                // found/reset, nothing is actually going to be resent, so the
                // message must stay visibly .failed.
                _ = try? await messagePersistence.applyEvent(localId: messageId, event: .retry)
            } catch {
                Logger.messages.error("retryMessage outbox reset failed: \(error.localizedDescription)")
            }
            await OutboxFlushTrigger.flushNow()
            return
        }

        // Resend IN PLACE — no delete + reinsert, so the bubble never flashes
        // "message supprimé". `.retry` transitions the EXISTING row .failed →
        // .queued (resets the retry budget) while preserving its content and
        // position: the orange retry band disappears and the bubble shows the
        // sending indicator immediately. `sendMessage` then re-drives the fast
        // (socket-first) send reusing the SAME clientMessageId — Phase 4 §6.2,
        // so the gateway dedup contract `(conversationId, clientMessageId)`
        // catches a prior attempt that DID reach the server (lost ACK). Its
        // optimistic insert harmlessly no-ops on the existing row (PK conflict,
        // swallowed by the insert's own catch), and the serverAck reconciles it
        // .queued → .sent. The local id of a Phase 4 optimistic message IS its
        // clientMessageId (no legacy temp_/offline_/retry_ prefix), so passing
        // `messageId` straight through as `existingTempId` is correct.
        let content = failedMsg.content
        let replyToId = failedMsg.replyToId
        // Preserve the message's ORIGINAL language identity across a retry —
        // omitting it here would let it fall through `sendMessage`'s
        // `originalLanguage ?? Self.composeLanguage(for:preferred:)` fallback
        // (re-detected from the resent content) and silently rewrite a
        // non-French message's language on every retry (Prisme violation).
        let originalLanguage = failedMsg.originalLanguage
        _ = try? await messagePersistence.applyEvent(localId: messageId, event: .retry)
        let succeeded = await sendMessage(content: content, replyToId: replyToId, originalLanguage: originalLanguage, existingTempId: messageId)
        // #4042 — un retry RÉUSSI doit faire disparaître la ligne outbox
        // D'ORIGINE (créée par le PREMIER échec) : `sendMessage` réutilise
        // le MÊME clientMessageId (Phase 4 §6.2), donc c'est la même ligne
        // que `SyncPillViewModel` continue de surfacer tant qu'elle reste
        // `.failed`/`.exhausted` en base — ce chemin texte-seul ne la
        // touchait jamais jusqu'ici (repro : retry réussi, entrée SyncPill
        // qui persiste indéfiniment).
        if succeeded {
            await offlineQueue.clearSendMessageRow(clientMessageId: messageId)
        }
    }

    func removeFailedMessage(messageId: String) {
        Task { [weak self] in
            guard let self else { return }
            try? await messagePersistence.markDeleted(localId: messageId, deletedAt: Date())
        }
    }

    // MARK: - Bulle optimiste média

    /// S7 — flip an optimistic media bubble to `.failed` so a stuck `.sending`
    /// spinner resolves into a retryable failed state when its upload/send
    /// fails (e.g. an offline visual attachment whose TUS upload threw). Without
    /// this the bubble stays a permanent ghost spinner. Thin passthrough; the
    /// store observation surfaces the new state.
    func markOptimisticMediaFailed(tempId: String, reason: String) async {
        try? await messagePersistence.markOptimisticFailed(localId: tempId, reason: reason)
    }

    /// Insère un MessageRecord optimiste GRDB pour un message média (image,
    /// vidéo, audio, fichier) AVANT que l'upload TUS ne soit terminé. Les
    /// attachments fournis pointent sur les fichiers locaux (file:// URLs)
    /// pour que la bulle affiche l'image / le player audio immédiatement —
    /// y compris hors-ligne. Le store observation surface la nouvelle ligne
    /// dans `messages` automatiquement, donc l'appelant n'a PAS besoin de
    /// faire `messages.append(...)` en parallèle (cela serait écrasé à la
    /// prochaine emission du publisher).
    ///
    /// `tempId` est la clé locale (= `MessageRecord.localId` dans GRDB).
    /// Préfixes attendus : `temp_<UUID>` (envoi en ligne), `offline_<UUID>`
    /// (queue offline), `retry_<UUID>` (queue retry).
    ///
    /// `originalLanguage` doit être la langue du composer (sélectionnée par
    /// l'utilisateur ou détectée). Hardcoder "fr" violerait le Prisme
    /// Linguistique pour les utilisateurs non-francophones — l'affichage
    /// optimiste afficherait le mauvais drapeau de langue jusqu'à la
    /// réconciliation serveur.
    func insertOptimisticMediaMessage(
        tempId: String,
        content: String,
        attachments: [MeeshyMessageAttachment],
        messageType: Message.MessageType,
        replyToId: String?,
        storyReplyToId: String? = nil,
        replyReference: ReplyReference? = nil,
        originalLanguage: String? = nil,
        sticker: MessageSticker? = nil,
        protection: MessageProtectionIntent
    ) {
        let now = Date()
        let attachmentsJson = attachments.isEmpty ? nil : try? JSONEncoder().encode(attachments)
        // Construit le ReplyReference riche AVANT l'insert : si `replyReference`
        // est fourni (story reply), on l'utilise ; sinon on resout via
        // `replyToId` depuis `self.messages`. Garantit que `replyToJson` est
        // non-nil des que `replyToId` ou `replyReference` n'est pas nil.
        let resolvedReplyRef = makeReplyReference(
            storyReplyReference: replyReference,
            replyToId: replyToId
        )
        let replyToJson = resolvedReplyRef.flatMap { try? JSONEncoder().encode($0) }
        let resolvedOriginalLanguage = originalLanguage ?? Self.composeLanguage(for: content, preferred: preferredLanguages)
        let record = OptimisticMediaRecordBuilder.record(
            tempId: tempId,
            conversationId: conversationId,
            senderId: currentUserId,
            sender: authManager.currentUser,
            content: content,
            originalLanguage: resolvedOriginalLanguage,
            messageType: messageType,
            replyToId: replyToId,
            storyReplyToId: storyReplyToId,
            replyToJson: replyToJson,
            attachmentsJson: attachmentsJson,
            stickerJson: OptimisticRecordColumns.stickerJson(sticker, id: tempId),
            protection: protection,
            now: now
        )
        let persistence = messagePersistence
        let recordConversationId = record.conversationId
        let attachmentCount = attachments.count
        // Captured for the conversation-list optimistic update below (computed on
        // the MainActor before the detached insert).
        let listFacet = LastMessageFacet.sent(
            id: tempId,
            text: content,
            at: now,
            attachments: attachments,
            ephemeralDuration: protection.ephemeralDurationSeconds,
            originalLanguage: resolvedOriginalLanguage
        )
        Task.detached(priority: .userInitiated) {
            do {
                try await persistence.insertOptimistic(record)
                Logger.messages.debug("SendFlow insertOptimisticMedia OK tempId=\(tempId, privacy: .public) convId=\(recordConversationId, privacy: .public) attachments=\(attachmentCount, privacy: .public)")
                // Local-first: surface the media message in the conversation list
                // immediately (preview + bump to top), before any server ACK —
                // the media path previously never updated the list optimistically.
                await ConversationSyncEngine.shared.updateConversationAfterSend(listFacet, conversationId: recordConversationId)
            } catch {
                Logger.messages.error("SendFlow insertOptimisticMedia FAILED tempId=\(tempId, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
            }
        }
    }
}
