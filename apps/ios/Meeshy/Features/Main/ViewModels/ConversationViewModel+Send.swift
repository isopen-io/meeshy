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

        // GRDB server ack — state machine transitions to .sent. Le coordinateur
        // journalise l'erreur ET un retour nil (machine à états qui refuse,
        // ligne absente), pour que la bascule ⏱→✓ reste observable.
        let ackResult = await sendCoordinator.acknowledge(localId: tempId, serverId: serverId, at: serverCreatedAt)
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
        // serveur (socket-first et REST) : le placer dans `send`, qui a
        // quatre `return true` dont un pour la simple mise en file HORS LIGNE,
        // demanderait la permission pour un message qui n'est pas encore parti.
        //
        // Détaché : la demande ouvre une alerte système qui peut rester à
        // l'écran indéfiniment, et rien de l'envoi ne doit l'attendre.
        Task { await PushPermissionPrompt.honourDeferredRequest() }
    }

    // MARK: - Les étapes de l'envoi

    /// L'envoi d'un `OutgoingMessage`, étape par étape : valider, poser la
    /// ligne (hors ligne ou optimiste), sceller, émettre, réconcilier.
    ///
    /// Le compteur `sendActivity` couvre toutes les étapes : des messages
    /// DISTINCTS partent en parallèle, aucun contenu n'est dédoublonné (#7985)
    /// — la seule clé de déduplication est le `clientMessageId`.
    func send(_ outgoing: OutgoingMessage) async -> Result<SentMessageReceipt, SendFailure> {
        Logger.messages.info("SendFlow enter convId=\(self.conversationId, privacy: .public) textLen=\(outgoing.text.count, privacy: .public) attachmentIds=\((outgoing.attachments.ids ?? []).count, privacy: .public) existingTempId=\(outgoing.reusedClientMessageId?.rawValue ?? "nil", privacy: .public) isSending=\(self.isSending, privacy: .public)")
        if let failure = validate(outgoing) { return .failure(failure) }

        sendActivity = sendActivity.began()
        Logger.messages.info("SendFlow LOCK inFlight=\(self.sendActivity.inFlight, privacy: .public) convId=\(self.conversationId, privacy: .public) textLen=\(outgoing.text.count, privacy: .public)")
        defer {
            sendActivity = sendActivity.ended()
            Logger.messages.info("SendFlow UNLOCK inFlight=\(self.sendActivity.inFlight, privacy: .public) convId=\(self.conversationId, privacy: .public)")
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
        _ = await collaborators.stager.stageOffline(
            outgoing, clientMessageId: clientMessageId, intent: intent, author: optimisticAuthor,
            conversationId: conversationId, language: composedLanguage(of: outgoing),
            effectFlags: optimisticEffectFlags(intent).rawValue
        )
        return await sendCoordinator.enqueueOffline(outgoing, clientMessageId: clientMessageId, intent: intent)
    }

    // MARK: En ligne

    /// La ligne optimiste d'un envoi en ligne, avant tout ACK. Un renvoi
    /// (`reusesExistingRow`) garde sa ligne.
    func stageOptimistic(_ outgoing: OutgoingMessage, context: SendAttemptContext) async {
        guard !context.reusesExistingRow else { return }
        let relation = outgoing.relation
        let replyRef = makeReplyReference(
            storyReplyReference: relation.storyReference,
            replyToId: relation.replyToId,
            citingAttachmentId: relation.attachmentReplyTo?.attachmentId
        )
        await collaborators.stager.stageOnline(
            outgoing, context: context, author: optimisticAuthor, conversationId: conversationId,
            replyReference: replyRef, effectFlags: optimisticEffectFlags(context.intent).rawValue
        )
    }

    private var optimisticAuthor: OptimisticAuthor {
        OptimisticAuthor(senderId: currentUserId, sender: authManager.currentUser)
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

    /// Socket-first (texte nu, socket connecté), puis REST sous délai de garde :
    /// le VM décide de l'éligibilité, le coordinateur émet. Un échec REST est
    /// journalisé puis relancé : `reconcile` le classe.
    func emit(_ outgoing: OutgoingMessage, payload: SealedOutgoingPayload, context: SendAttemptContext) async throws -> SentMessageReceipt {
        let eligible = outgoing.socketFirstEligible(
            connected: messageSocket.isConnected,
            isEncrypted: payload.isEncrypted,
            intent: context.intent,
            hasPendingEffects: pendingEffects.hasAnyEffect
        )
        return try await sendCoordinator.emit(outgoing, payload: payload, context: context, socketFirst: eligible)
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
        await collaborators.failureRecovery.recover(
            from: error, outgoing: outgoing, payload: payload, context: context,
            fallbackEligible: outgoing.socketFallbackEligible(intent: context.intent, hasPendingEffects: pendingEffects.hasAnyEffect),
            coordinator: sendCoordinator,
            hooks: SendRecoveryHooks(
                withdraw: { [weak self] in await self?.withdrawRefusedMessage(tempId: $0, restriction: $1) },
                holdSlowMode: { [weak self] in await self?.holdForSlowMode(tempId: $0, slowMode: $1, error: $2) },
                registerServerId: { [weak self] in self?.pendingServerIds[$0] = $1 }
            )
        )
    }

    /// Les vues qui pilotent leur propre envoi (média, sticker) rapportent
    /// l'échec de leur upload par ici, pour qu'il soit journalisé.
    func recordSendFailure(tempId: String, error: any Error) async {
        await sendCoordinator.recordFailure(error, localId: tempId)
    }

    // MARK: - Retry Failed Message

    func retryMessage(messageId: String) async {
        guard let idx = messageIndex(for: messageId) else { return }
        let failedMsg = messages[idx]
        guard failedMsg.deliveryStatus == .failed else { return }

        guard failedMsg.attachments.isEmpty else {
            await resetOutboxRowForRetry(messageId: messageId)
            return
        }

        // Resend IN PLACE — no delete + reinsert, so the bubble never flashes
        // "message supprimé". `.retry` transitions the EXISTING row .failed →
        // .queued (resets the retry budget) and keeps its position; the send
        // then re-drives the fast path reusing the SAME clientMessageId
        // (Phase 4 §6.2), so the gateway dedup `(conversationId,
        // clientMessageId)` catches a prior attempt that DID reach the server.
        await sendCoordinator.markRetrying(localId: messageId)
        let succeeded = await send(FailedMessageReplay.outgoing(of: failedMsg, conversationId: conversationId)).isAccepted
        // #4042 — un retry RÉUSSI fait disparaître la ligne outbox D'ORIGINE
        // (même clientMessageId) que `SyncPillViewModel` surface tant qu'elle
        // reste `.failed`/`.exhausted`.
        if succeeded {
            await offlineQueue.clearSendMessageRow(clientMessageId: messageId)
        }
    }

    /// Un message média en échec rejoue par l'outbox durable : elle seule
    /// retient les vrais ids de pièces déjà téléversées (le `Message` affiché
    /// ne porte que les ids LOCAUX d'avant l'upload). La ligne locale ne passe
    /// `.queued` que si la réinitialisation a réussi — sinon rien ne partira,
    /// et la bulle doit rester visiblement en échec.
    private func resetOutboxRowForRetry(messageId: String) async {
        do {
            try await offlineQueue.retryByClientMessageId(messageId)
            await sendCoordinator.markRetrying(localId: messageId)
        } catch {
            Logger.messages.error("retryMessage outbox reset failed: \(error.localizedDescription)")
        }
        await OutboxFlushTrigger.flushNow()
    }

    func removeFailedMessage(messageId: String) {
        Task { [weak self] in
            guard let self else { return }
            let persistence = messagePersistence
            await bestEffort("send.removeFailed", category: .messages) {
                try await persistence.markDeleted(localId: messageId, deletedAt: Date())
            }
        }
    }

    // MARK: - Bulle optimiste média

    /// S7 — flip an optimistic media bubble to `.failed` so a stuck `.sending`
    /// spinner resolves into a retryable failed state when its upload/send
    /// fails (e.g. an offline visual attachment whose TUS upload threw). Without
    /// this the bubble stays a permanent ghost spinner. Thin passthrough; the
    /// store observation surfaces the new state.
    func markOptimisticMediaFailed(tempId: String, reason: String) async {
        await sendCoordinator.markFailed(localId: tempId, reason: reason)
    }

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
        collaborators.stager.stageMedia(
            OptimisticMediaDraft(
                conversationId: conversationId,
                tempId: tempId,
                content: content,
                attachments: attachments,
                messageType: messageType,
                replyToId: replyToId,
                storyReplyToId: storyReplyToId,
                // Construit le ReplyReference riche AVANT l'insert : si `replyReference`
                // est fourni (story reply), on l'utilise ; sinon on resout via
                // `replyToId` depuis `self.messages`. Garantit que `replyToJson` est
                // non-nil des que `replyToId` ou `replyReference` n'est pas nil.
                replyReference: makeReplyReference(storyReplyReference: replyReference, replyToId: replyToId),
                originalLanguage: originalLanguage ?? Self.composeLanguage(for: content, preferred: preferredLanguages),
                sticker: sticker,
                protection: protection
            ),
            author: optimisticAuthor
        )
    }
}
