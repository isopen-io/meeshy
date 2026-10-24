import Foundation
import MeeshySDK
import os

// MARK: - OutboxDispatcher — l'envoi de MESSAGES (#4282)
//
// Extrait d'`OutboxDispatcher.swift`, qui portait 1519 lignes — 40 % au-dessus
// du budget 800–1100. La directive du 2026-08-28 interdit d'AJOUTER à un
// fichier déjà hors budget : on extrait d'abord, on ajoute ensuite. La
// migration des chemins d'API (#4282) y ajoutait onze lignes, et c'est ce que
// le cliquet de dette a refusé — en faisant exactement son travail : rendre le
// coût d'un fichier trop gros payable par le prochain qui y touche, quel que
// soit son sujet.
//
// La découpe suit une RESPONSABILITÉ, pas une tranche : ici vit tout ce qui
// rejoue un message (envoi, édition, suppression, réaction) — la famille la
// plus longue et la plus autonome du dispatcher. Les mutations sociales et de
// contenu restent chez elles.
//
// Les fonctions déplacées perdent leur `private` : elles vivent désormais dans
// un autre fichier, et `dispatch(_:)` doit pouvoir les appeler.

extension OutboxDispatcher {

    // MARK: - Send Message

    /// Durably reconciles a successful message send — independent of whether a
    /// `ConversationViewModel` is currently alive for the conversation.
    ///
    /// Without this, the optimistic→server transition (`serverAck`) only ran
    /// from `ConversationViewModel`'s `retrySucceeded` Combine sink. When a
    /// flush completed while the user was outside the conversation, that
    /// transient `PassthroughSubject` event was dropped, the optimistic GRDB
    /// row stayed `.sending`, and a cold reload duplicated it against the real
    /// server message. Applying the `serverAck` here — at the always-alive
    /// dispatcher — guarantees the row flips to `.sent` and a `PendingIdRecord`
    /// is written regardless of UI state. When a VM IS alive its sink runs the
    /// same `applyEvent` again as a harmless no-op on the already-`.sent` row.
    func reconcileSuccessfulMessageSend(
        clientMessageId: String,
        serverId: String,
        conversationId: String
    ) async {
        let store = await persistence()
        do {
            _ = try await store.applyEvent(
                localId: clientMessageId,
                event: .serverAck(serverId: serverId, at: Date())
            )
        } catch {
            // Le serveur a accepté le message mais la ligne locale n'est pas
            // passée `.sent` : la bulle reste « en cours d'envoi » jusqu'au
            // prochain resync.
            logger.error("Server ACK not applied for \(clientMessageId, privacy: .public), bubble stays 'sending': \(error.localizedDescription, privacy: .public)")
        }
        await CacheCoordinator.shared.messages.mergeUpdate(for: conversationId) { cached in
            cached.filter { $0.id != clientMessageId }
        }
        OfflineQueue.shared.retrySucceeded.send(OfflineRetrySuccess(
            clientMessageId: clientMessageId,
            serverId: serverId,
            conversationId: conversationId,
            kind: .sendMessage
        ))
    }

    /// Résout `copyAttachmentsFromMessageId` pour CETTE ligne — un partage
    /// multi-destinataires COPIE les pièces jointes du message porté par
    /// l'origine, jamais un transfert (voir `ShareFanoutOriginResolver`).
    ///
    /// Un message ordinaire sort tôt, sans lecture GRDB. L'origine non encore
    /// acquittée lève `OutboxDeferralError.waitingForFanoutOrigin` — erreur
    /// TYPÉE, que `OutboxFlusher` replanifie SANS consommer `attempts`, borné
    /// par `OutboxFlusher.fanoutOriginWaitTimeout`.
    ///
    /// `item.copyAttachmentsFromServerMessageId` court-circuite la résolution
    /// GRDB quand il est connu : une origine servie par l'extension de partage
    /// n'a JAMAIS de ligne locale, donc la résolution rendrait `nil` pour
    /// toujours et la ligne se reporterait jusqu'à épuisement.
    func resolveCopyAttachmentsFromMessageId(for item: OfflineQueueItem) async throws -> String? {
        guard let originClientMessageId = item.copyAttachmentsFromClientMessageId else { return nil }
        let resolvedServerId: String?
        if let known = item.copyAttachmentsFromServerMessageId, !known.isEmpty {
            resolvedServerId = known
        } else {
            resolvedServerId = (await bestEffort("outbox.resolveFanoutOrigin", category: .messages) {
                try await persistence().resolveServerId(for: originClientMessageId)
            }) ?? nil
        }
        let fanout = ShareFanoutOriginResolver.resolve(
            copyAttachmentsFromClientMessageId: originClientMessageId,
            resolvedServerId: resolvedServerId
        )
        switch fanout {
        case .notAFanout:
            return nil
        case .ready(let serverMessageId):
            return serverMessageId
        case .waitingForOrigin(let clientMessageId):
            throw OutboxDeferralError.waitingForFanoutOrigin(clientMessageId: clientMessageId)
        }
    }

    /// Un rejeu qui échoue s'écrit sur la ligne GRDB : sans cela, une bulle
    /// posée hors ligne restait `.sending` jusqu'à l'épuisement du budget, que
    /// seul un `ConversationViewModel` vivant ou l'ouverture de la conversation
    /// finissait par voir. Un report (`OutboxDeferralError`) et une annulation
    /// ne sont pas des échecs d'envoi : la ligne n'est pas touchée.
    func dispatchSendMessageRecordingFailure(_ record: OutboxRecord) async throws {
        do {
            try await dispatchSendMessage(record)
        } catch {
            guard OutboxDispatcher.persistsReplayFailure(error) else { throw error }
            let localId = record.messageLocalId ?? record.clientMessageId
            await bestEffort("outbox.sendFailed", category: .messages) {
                try await persistence().applyEvent(localId: localId, event: .sendFailed(error))
            }
            throw error
        }
    }

    static func persistsReplayFailure(_ error: any Error) -> Bool {
        if error is OutboxDeferralError || error is CancellationError { return false }
        return true
    }

    /// Nettoyage best-effort des fichiers déjà téléversés : un échec est
    /// bénin, `OutboxFlusher.cleanupLocalFiles(for:)` les reprend à la fin de
    /// la ligne (appliquée ou épuisée).
    func removeReplayedFiles(_ paths: [String], kind: String) {
        for path in paths {
            do { try FileManager.default.removeItem(atPath: path) } catch {
                logger.warning("\(kind, privacy: .public) dispatch: failed to remove temp file \(path, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    func dispatchSendMessage(_ record: OutboxRecord) async throws {
        if record.id.hasPrefix("ofq_") {
            let item: OfflineQueueItem
            do {
                item = try decoder.decode(OfflineQueueItem.self, from: record.payload)
            } catch {
                // Corrupt payload — accept to let the flusher remove the row.
                logger.error("Corrupt OfflineQueueItem payload for record \(record.id, privacy: .public), dropping: \(error.localizedDescription, privacy: .public)")
                return
            }

            // Rejeu audio multi-pistes : `localAudioPaths` est le champ
            // canonique, les anciennes lignes ne portent que `localAudioPath`.
            let pendingAudioPaths: [String] = {
                if let many = item.localAudioPaths, !many.isEmpty { return many }
                if let one = item.localAudioPath, !one.isEmpty { return [one] }
                return []
            }()

            // Le canal socket `message:send-with-attachments` ne transmet pas
            // la copie de pièces (le schéma gateway ne déclare pas le champ,
            // Zod le supprimerait en silence) : cette combinaison échoue fort
            // plutôt que de laisser partir un message vide de sa promesse.
            let hasLocalMediaToReplay = !pendingAudioPaths.isEmpty || !(item.localMediaPaths?.isEmpty ?? true)
            if hasLocalMediaToReplay, let unsupportedOriginId = item.copyAttachmentsFromClientMessageId {
                throw NSError(
                    domain: "OutboxDispatcher",
                    code: 501,
                    userInfo: [NSLocalizedDescriptionKey:
                        "Fan-out de partage (\(unsupportedOriginId)) non supporté sur le chemin socket média/audio local"]
                )
            }

            if !pendingAudioPaths.isEmpty {
                let serverOrigin = MeeshyConfig.shared.serverOrigin
                // Rejeu d'une pièce jointe de MESSAGE : accessible à un
                // invité de lien partagé, contrairement aux médias de post.
                guard let baseURL = URL(string: serverOrigin),
                      let credential = APIClient.shared.requestCredential else {
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 401,
                        userInfo: [NSLocalizedDescriptionKey: "No baseURL or auth token to upload audio"]
                    )
                }

                let uploader = TusUploadManager(baseURL: baseURL)
                var uploadedIds: [String] = []
                var uploadedPaths: [String] = []
                var firstUploadErrorAudio: Error?

                for stored in pendingAudioPaths {
                    let absolutePath = OfflineQueue.absoluteAudioPath(forStored: stored)
                    guard FileManager.default.fileExists(atPath: absolutePath) else {
                        logger.error("Audio file missing on dispatch, path=\(stored, privacy: .public)")
                        continue
                    }
                    do {
                        let tusResult = try await uploader.uploadFile(
                            fileURL: URL(fileURLWithPath: absolutePath),
                            mimeType: "audio/mp4",
                            credential: credential
                        )
                        uploadedIds.append(tusResult.id)
                        uploadedPaths.append(absolutePath)
                    } catch {
                        logger.error("Audio track TUS upload failed (best-effort skip): \(error.localizedDescription, privacy: .public)")
                        if firstUploadErrorAudio == nil { firstUploadErrorAudio = error }
                    }
                }

                try Self.requireCompleteUpload(
                    uploadedIds: uploadedIds, firstUploadError: firstUploadErrorAudio,
                    emptyDescription: "No audio track uploaded for offline audio dispatch")

                let serverId = try await replayUploadedAttachments(item, uploadedIds: uploadedIds, kind: "audio")

                removeReplayedFiles(uploadedPaths, kind: "audio")

                await reconcileSuccessfulMessageSend(
                    clientMessageId: item.clientMessageId,
                    serverId: serverId,
                    conversationId: item.conversationId
                )
                return
            }

            // Offline visual-media (photo/video) replay. Each pending file
            // (relocated under Documents/pending-media/ by enqueueMedia) is
            // uploaded via TUS with a MIME derived from its extension (unlike
            // the audio branch which hardcodes audio/mp4), then all ids go out
            // in one message:send-with-attachments. TUS checkpoint resume fires
            // on re-upload (same sha256 key), so a kill mid-upload resumes from
            // the saved offset.
            if let pendingMediaPaths = item.localMediaPaths, !pendingMediaPaths.isEmpty {
                let serverOrigin = MeeshyConfig.shared.serverOrigin
                // Rejeu d'une pièce jointe de MESSAGE : accessible à un
                // invité de lien partagé, contrairement aux médias de post.
                guard let baseURL = URL(string: serverOrigin),
                      let credential = APIClient.shared.requestCredential else {
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 401,
                        userInfo: [NSLocalizedDescriptionKey: "No baseURL or auth token to upload media"]
                    )
                }

                let uploader = TusUploadManager(baseURL: baseURL)
                var uploadedIds: [String] = []
                var uploadedPaths: [String] = []
                var firstUploadErrorMedia: Error?

                for (index, stored) in pendingMediaPaths.enumerated() {
                    let absolutePath = OfflineQueue.absoluteMediaPath(forStored: stored)
                    guard FileManager.default.fileExists(atPath: absolutePath) else {
                        logger.error("Media file missing on dispatch, path=\(stored, privacy: .public)")
                        continue
                    }
                    do {
                        let mime = MimeTypeResolver.mimeType(
                            forExtension: URL(fileURLWithPath: absolutePath).pathExtension)
                        let tusResult = try await MessageAttachmentUpload.uploadMessageAttachment(
                            with: uploader, fileURL: URL(fileURLWithPath: absolutePath),
                            mimeType: mime,
                            credential: credential, fileName: item.originalMediaName(at: index)
                        )
                        uploadedIds.append(tusResult.id)
                        uploadedPaths.append(absolutePath)
                    } catch {
                        logger.error("Media TUS upload failed (best-effort skip): \(error.localizedDescription, privacy: .public)")
                        if firstUploadErrorMedia == nil { firstUploadErrorMedia = error }
                    }
                }

                try Self.requireCompleteUpload(
                    uploadedIds: uploadedIds, firstUploadError: firstUploadErrorMedia,
                    emptyDescription: "No media uploaded for offline media dispatch")

                let serverId = try await replayUploadedAttachments(item, uploadedIds: uploadedIds, kind: "media")

                removeReplayedFiles(uploadedPaths, kind: "media")

                await reconcileSuccessfulMessageSend(
                    clientMessageId: item.clientMessageId,
                    serverId: serverId,
                    conversationId: item.conversationId
                )
                return
            }

            // Fan-out de partage : les cibles 2..N réclament une COPIE des
            // pièces jointes du message porté par la première — jamais un
            // transfert, qui ferait afficher « Transféré depuis <conversation
            // source> » au destinataire (décision user, invariant produit).
            let copyAttachmentsFromMessageId = try await resolveCopyAttachmentsFromMessageId(for: item)

            let request = Self.textReplayRequest(
                for: item, copyAttachmentsFromMessageId: copyAttachmentsFromMessageId)
            let response = try await messageService.send(
                conversationId: item.conversationId, request: request
            )
            // Reconcile the optimistic clientMessageId durably (GRDB row +
            // PendingIdRecord + cache) so neither a `message:new` socket echo
            // nor a cold reload duplicates the row.
            await reconcileSuccessfulMessageSend(
                clientMessageId: item.clientMessageId,
                serverId: response.id,
                conversationId: item.conversationId
            )

        } else if record.id.hasPrefix("mrq_") {
            // `MessageRetryQueue` was removed but legacy `mrq_*` rows may
            // still live on devices that upgraded mid-queue. The payload
            // format was a strict superset of the fields needed for replay;
            // we hand-roll a minimal struct here instead of keeping the
            // deleted public types around just for legacy decoding.
            //
            // Decoded rows are sent through the same unified
            // `OfflineQueue.shared.retrySucceeded` signal as `ofq_*` rows
            // so ConversationViewModel reconciles via a single subscription.
            struct LegacyMrqPayload: Decodable {
                let conversationId: String
                let content: String
                let originalLanguage: String?
                let replyToId: String?
                let attachmentIds: [String]?
                let clientMessageId: String?
            }
            let item: LegacyMrqPayload
            do {
                item = try decoder.decode(LegacyMrqPayload.self, from: record.payload)
            } catch {
                logger.error("Corrupt legacy mrq_* payload for record \(record.id, privacy: .public), dropping: \(error.localizedDescription, privacy: .public)")
                return
            }
            guard let clientMessageId = item.clientMessageId else {
                logger.error("Legacy mrq_* payload without clientMessageId for record \(record.id, privacy: .public), dropping")
                return
            }
            let request = SendMessageRequest(
                content: item.content,
                originalLanguage: item.originalLanguage ?? "fr",
                replyToId: item.replyToId,
                attachmentIds: item.attachmentIds,
                clientMessageId: clientMessageId
            )
            let response = try await messageService.send(
                conversationId: item.conversationId, request: request
            )
            await reconcileSuccessfulMessageSend(
                clientMessageId: clientMessageId,
                serverId: response.id,
                conversationId: item.conversationId
            )
        }
        // Unknown namespace prefix — stale row, accept so the flusher removes it.
    }

    // MARK: - Rejeu des pièces téléversées (#8350)

    /// Un envoi média ne part que COMPLET. Un échec de téléversement sur une des
    /// pièces faisait partir le message avec les autres, puis le flusher
    /// supprimait la ligne et `cleanupLocalFiles` effaçait le fichier manquant —
    /// qui n'existait nulle part ailleurs. L'erreur d'ORIGINE remonte : le
    /// flusher y reconnaît coupure ou refus d'authentification et réessaie ;
    /// le reprise TUS (même clé) ne retéléverse pas ce qui est déjà monté.
    static func requireCompleteUpload(uploadedIds: [String], firstUploadError: Error?, emptyDescription: String) throws {
        if let firstUploadError { throw firstUploadError }
        guard !uploadedIds.isEmpty else {
            throw NSError(
                domain: "OutboxDispatcher",
                code: 503,
                userInfo: [NSLocalizedDescriptionKey: emptyDescription]
            )
        }
    }

    /// La requête du rejeu TEXTE d'une ligne `sendMessage` (sans fichier local).
    static func textReplayRequest(for item: OfflineQueueItem, copyAttachmentsFromMessageId: String?) -> SendMessageRequest {
        // La protection armée à l'envoi (#8303) — flou, vue unique, durée
        // et flamme-œil. Le rejeu la perdait : un envoi protégé mis en file
        // repartait en clair.
        let protection = item.replayProtection
        return SendMessageRequest(
            content: item.content,
            // La langue d'origine voyage comme dans les rejeux média, protégé
            // et socket : sans elle le serveur redevinait la langue du message.
            originalLanguage: item.originalLanguage,
            replyToId: item.replyToId,
            storyReplyToId: item.storyReplyToId,
            forwardedFromId: item.forwardedFromId,
            forwardedFromConversationId: item.forwardedFromConversationId,
            attachmentIds: item.attachmentIds,
            ephemeralDuration: protection.ephemeralDurationSeconds,
            isViewOnce: protection.wireIsViewOnce,
            isBlurred: protection.wireIsBlurred,
            effectFlags: protection.wireEffectFlags.isEmpty ? nil : protection.wireEffectFlags.rawValue,
            clientMessageId: item.clientMessageId,
            // Lieu partagé rejoué au renvoi, comme pour un post et un
            // commentaire : clé top-level `location`, omise quand nil.
            location: item.location,
            copyAttachmentsFromMessageId: copyAttachmentsFromMessageId,
            // Sticker (#4823) rejoué sous la même clé `sticker` que
            // l'envoi direct — omis quand nil.
            sticker: item.sticker,
            // L'ANCRE de la pièce citée (#6164) rejouée telle quelle. Le
            // rejeu passe TOUJOURS par ce POST : `sendMessage` déclare un
            // envoi porteur d'ancre inéligible au canal socket, qui ne la
            // transporte pas — sans cette ligne, un échec réseau suffisait
            // à faire citer la première photo d'un carrousel à une réponse
            // composée sur la troisième.
            attachmentReplyTo: QuotedAttachmentSend(anchor: item.attachmentReplyTo),
            // La pièce CHOISIE d'un transfert (#9914, #10947) : sans elle, le
            // rejeu recopierait tout le lot que l'utilisateur avait écarté.
            forwardedAttachmentIds: item.forwardedAttachmentIds
        )
    }

    /// Le corps REST d'un média PROTÉGÉ rejoué depuis la file — `nil` pour un
    /// média non protégé, qui garde le canal socket.
    ///
    /// Les branches média repartaient toutes par `sendWithAttachmentsAsync`,
    /// qui ne transporte aucune protection : une photo floutée, à vue unique,
    /// éphémère ou flamme-œil capturée hors ligne repartait EN CLAIR. La
    /// flamme-œil ne part jamais par socket (#8303) ; le POST porte tout.
    static func protectedMediaReplayRequest(for item: OfflineQueueItem, uploadedIds: [String]) -> SendMessageRequest? {
        let protection = item.replayProtection
        guard !protection.isEmpty else { return nil }
        return SendMessageRequest(
            content: item.content,
            originalLanguage: item.originalLanguage,
            replyToId: item.replyToId,
            storyReplyToId: item.storyReplyToId,
            attachmentIds: uploadedIds,
            ephemeralDuration: protection.ephemeralDurationSeconds,
            isViewOnce: protection.wireIsViewOnce,
            isBlurred: protection.wireIsBlurred,
            effectFlags: protection.wireEffectFlags.isEmpty ? nil : protection.wireEffectFlags.rawValue,
            clientMessageId: item.clientMessageId,
            location: item.location,
            sticker: item.sticker
        )
    }

    /// Envoie le message qui porte les pièces que la file vient de téléverser,
    /// et rend l'identifiant serveur : par le POST quand il est protégé, par le
    /// socket sinon (lieu et sticker rejoués sous les mêmes clés que le REST).
    func replayUploadedAttachments(_ item: OfflineQueueItem, uploadedIds: [String], kind: String) async throws -> String {
        if let request = Self.protectedMediaReplayRequest(for: item, uploadedIds: uploadedIds) {
            return try await messageService.send(conversationId: item.conversationId, request: request).id
        }
        let ack = await MessageSocketManager.shared.sendWithAttachmentsAsync(
            conversationId: item.conversationId,
            content: item.content.isEmpty ? nil : item.content,
            attachmentIds: uploadedIds,
            replyToId: item.replyToId,
            storyReplyToId: item.storyReplyToId,
            originalLanguage: item.originalLanguage,
            clientMessageId: item.clientMessageId,
            location: item.location,
            sticker: item.sticker
        )
        guard let ack else {
            throw NSError(
                domain: "OutboxDispatcher",
                code: 502,
                userInfo: [NSLocalizedDescriptionKey: "Socket ACK missing for offline \(kind) dispatch"]
            )
        }
        return ack.messageId
    }

    // MARK: - Edit Message

    func dispatchEditMessage(_ record: OutboxRecord) async throws {
        let payload: OfflineEditPayload
        do {
            payload = try decoder.decode(OfflineEditPayload.self, from: record.payload)
        } catch {
            logger.error("Corrupt OfflineEditPayload for record \(record.id, privacy: .public), dropping: \(error.localizedDescription, privacy: .public)")
            return
        }
        _ = try await MessageService.shared.edit(
            messageId: payload.messageId,
            content: payload.content
        )
        logger.info("Edit dispatched for message \(payload.messageId, privacy: .public)")
    }

    // MARK: - Delete Message

    func dispatchDeleteMessage(_ record: OutboxRecord) async throws {
        let payload: OfflineDeletePayload
        do {
            payload = try decoder.decode(OfflineDeletePayload.self, from: record.payload)
        } catch {
            logger.error("Corrupt OfflineDeletePayload for record \(record.id, privacy: .public), dropping: \(error.localizedDescription, privacy: .public)")
            return
        }
        try await MessageService.shared.delete(
            conversationId: payload.conversationId,
            messageId: payload.messageId
        )
        logger.info("Delete dispatched for message \(payload.messageId, privacy: .public)")
    }

    // MARK: - Send Reaction

    func dispatchSendReaction(_ record: OutboxRecord) async throws {
        let payload: ReactionOutboxPayload
        do {
            payload = try decoder.decode(ReactionOutboxPayload.self, from: record.payload)
        } catch {
            logger.error("Corrupt ReactionOutboxPayload for record \(record.id, privacy: .public), dropping: \(error.localizedDescription, privacy: .public)")
            return
        }
        do {
            switch payload.action {
            case .add:
                try await ReactionService.shared.add(
                    messageId: payload.messageId,
                    emoji: payload.emoji
                )
            case .remove:
                try await ReactionService.shared.remove(
                    messageId: payload.messageId,
                    emoji: payload.emoji
                )
            }
            logger.info("Reaction \(payload.action.rawValue, privacy: .public) \(payload.emoji, privacy: .public) dispatched for message \(payload.messageId, privacy: .public)")
            // Reactions have no server-assigned id (the gateway broadcasts
            // `reaction:added` / `reaction:removed` over the socket), but
            // the success signal still carries enough context for any
            // pending-indicator UI to clear its hint. `serverId` is set to
            // `clientMessageId` as a stable non-empty placeholder.
            OfflineQueue.shared.retrySucceeded.send(OfflineRetrySuccess(
                clientMessageId: payload.clientMessageId,
                serverId: payload.clientMessageId,
                conversationId: payload.conversationId,
                kind: .sendReaction,
                reaction: OfflineRetrySuccess.ReactionContext(
                    messageId: payload.messageId,
                    emoji: payload.emoji,
                    action: payload.action
                )
            ))
        } catch APIError.serverError(let code, _) where code == 404 || code == 409 || code == 410 {
            // Permanent rejection — 404/410 (message gone) and 409 (state
            // conflict: already reacted / already removed). Replaying the
            // same request would bounce forever, so we treat the row as
            // exhausted right now, emit the unified signal so the optimistic
            // UI rolls back, and return success so the flusher deletes the
            // row instead of retrying.
            logger.warning("Reaction \(payload.action.rawValue, privacy: .public) \(payload.emoji, privacy: .public) on \(payload.messageId, privacy: .public) rejected (\(code, privacy: .public)) — dropping")
            OfflineQueue.shared.retryExhausted.send(OfflineRetryExhausted(
                kind: .sendReaction,
                clientMessageId: payload.clientMessageId,
                conversationId: payload.conversationId,
                reaction: OfflineRetrySuccess.ReactionContext(
                    messageId: payload.messageId,
                    emoji: payload.emoji,
                    action: payload.action
                ),
                lastError: "HTTP \(code)"
            ))
            // Returning normally drains the row. The flusher.deleteOne path
            // is the same as for a true success — gateway dedup means the
            // server-side outcome is already terminal regardless.
        }
    }
}
