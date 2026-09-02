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
        let persistence = await DependencyContainer.shared.messagePersistence
        do {
            _ = try await persistence.applyEvent(
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
    /// Sortie anticipée sur `item.copyAttachmentsFromClientMessageId == nil`
    /// (round 1 de revue, Minor) : un message ORDINAIRE — l'écrasante
    /// majorité — ne paie plus une lecture GRDB sur la clé `""` dont le
    /// résultat était de toute façon ignoré.
    ///
    /// L'origine non encore acquittée lève `OutboxDeferralError
    /// .waitingForFanoutOrigin` — erreur TYPÉE, pas un `NSError` générique —
    /// pour qu'`OutboxFlusher` la reconnaisse (`isWaitingForFanoutOrigin`) et
    /// replanifie la ligne SANS consommer `attempts`, borné par
    /// `OutboxFlusher.fanoutOriginWaitTimeout` : partir maintenant livrerait
    /// un message VIDE de pièces jointes, mais un simple `NSError` (round 1
    /// précédent) épuisait le budget de tentatives en ~30s — exactement le
    /// délai qu'un upload photo/vidéo sur réseau médiocre dépasse en usage
    /// nominal.
    ///
    /// **`item.copyAttachmentsFromServerMessageId` court-circuite la
    /// résolution GRDB quand il est déjà connu** (défaut bloquant corrigé) :
    /// une origine servie par l'extension de partage n'a JAMAIS de ligne
    /// locale (l'extension poste en REST sans dépendance SDK), donc
    /// `resolveServerId(for: originClientMessageId)` résout `nil` pour
    /// TOUJOURS dans ce cas — la ligne se reporterait indéfiniment jusqu'à
    /// épuiser son budget. `SharePendingSendConsumer` lit alors l'identifiant
    /// serveur déjà écrit sur la fiche (`PendingTarget.serverMessageId`) et
    /// le transmet ici tel quel. Une origine partie par l'app (chemin
    /// existant, non régressé) ne pose jamais ce champ : la résolution
    /// GRDB ci-dessous s'applique alors normalement.
    func resolveCopyAttachmentsFromMessageId(for item: OfflineQueueItem) async throws -> String? {
        guard let originClientMessageId = item.copyAttachmentsFromClientMessageId else { return nil }
        let resolvedServerId: String?
        if let known = item.copyAttachmentsFromServerMessageId, !known.isEmpty {
            resolvedServerId = known
        } else {
            resolvedServerId = try? await DependencyContainer.shared.messagePersistence
                .resolveServerId(for: originClientMessageId)
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

            // Multi-track audio offline replay. The canonical field is
            // `localAudioPaths` (array); legacy rows may still carry only
            // `localAudioPath` (scalar). Both are resolved so the dispatcher
            // handles every row shape. Each track is uploaded via TUS
            // independently; missing or failed tracks are skipped
            // (best-effort). All uploaded ids go out in a single
            // `message:send-with-attachments` socket event.
            let pendingAudioPaths: [String] = {
                if let many = item.localAudioPaths, !many.isEmpty { return many }
                if let one = item.localAudioPath, !one.isEmpty { return [one] }
                return []
            }()

            // Round 1 de revue (Important 3) : `sendWithAttachmentsAsync` —
            // donc les deux branches socket ci-dessous (rejeu audio/média
            // hors-ligne) — n'a AUCUN moyen de transmettre
            // `copyAttachmentsFromMessageId`. Le handler gateway
            // `handleMessageSendWithAttachments` ne le lit pas non plus (seul
            // `message:send`, le path texte, le fait —
            // `SocketMessageSendWithAttachmentsSchema` côté gateway ne
            // déclare pas le champ, Zod le supprimerait en silence). Aucune
            // cible non-origine ne porte de média local aujourd'hui
            // (`SharePendingSendConsumer.enqueue` ne pose
            // `copyAttachmentsFromClientMessageId` QUE sur les lignes SANS
            // média local) : cette combinaison n'arrive jamais en pratique,
            // mais rien ne l'empêchait STRUCTURELLEMENT, et le champ aurait
            // disparu EN SILENCE. Échoue fort plutôt que de laisser partir un
            // message vide de la promesse de copie.
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
                    }
                }

                guard !uploadedIds.isEmpty else {
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 503,
                        userInfo: [NSLocalizedDescriptionKey: "No audio track uploaded for offline audio dispatch"]
                    )
                }

                let ack = await MessageSocketManager.shared.sendWithAttachmentsAsync(
                    conversationId: item.conversationId,
                    content: item.content.isEmpty ? nil : item.content,
                    attachmentIds: uploadedIds,
                    replyToId: item.replyToId,
                    storyReplyToId: nil,
                    originalLanguage: item.originalLanguage,
                    clientMessageId: item.clientMessageId,
                    // Lieu partagé rejoué au renvoi — le canal socket porte la
                    // même clé `location` que le corps REST.
                    location: item.location,
                    // Sticker (#4823) : le PNG remonté repart avec ce qu'il
                    // représente, sinon le destinataire reçoit une image muette.
                    sticker: item.sticker
                )
                guard let ack else {
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 502,
                        userInfo: [NSLocalizedDescriptionKey: "Socket ACK missing for offline audio dispatch"]
                    )
                }

                // Best-effort cleanup of uploaded tracks. Failure here is
                // benign — skipped (failed-but-present) track files are
                // reclaimed by `OutboxFlusher.cleanupLocalFiles(for:)` when
                // the outbox record terminates (applied or exhausted), which
                // now sweeps both `localAudioPath` and `localAudioPaths`.
                for path in uploadedPaths {
                    do { try FileManager.default.removeItem(atPath: path) } catch {
                        logger.warning("audio dispatch: failed to remove temp file \(path, privacy: .public): \(error.localizedDescription, privacy: .public)")
                    }
                }

                await reconcileSuccessfulMessageSend(
                    clientMessageId: item.clientMessageId,
                    serverId: ack.messageId,
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

                for stored in pendingMediaPaths {
                    let absolutePath = OfflineQueue.absoluteMediaPath(forStored: stored)
                    guard FileManager.default.fileExists(atPath: absolutePath) else {
                        logger.error("Media file missing on dispatch, path=\(stored, privacy: .public)")
                        continue
                    }
                    do {
                        let mime = MimeTypeResolver.mimeType(
                            forExtension: URL(fileURLWithPath: absolutePath).pathExtension)
                        let tusResult = try await uploader.uploadFile(
                            fileURL: URL(fileURLWithPath: absolutePath),
                            mimeType: mime,
                            credential: credential
                        )
                        uploadedIds.append(tusResult.id)
                        uploadedPaths.append(absolutePath)
                    } catch {
                        logger.error("Media TUS upload failed (best-effort skip): \(error.localizedDescription, privacy: .public)")
                    }
                }

                guard !uploadedIds.isEmpty else {
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 503,
                        userInfo: [NSLocalizedDescriptionKey: "No media uploaded for offline media dispatch"]
                    )
                }

                let ack = await MessageSocketManager.shared.sendWithAttachmentsAsync(
                    conversationId: item.conversationId,
                    content: item.content.isEmpty ? nil : item.content,
                    attachmentIds: uploadedIds,
                    replyToId: item.replyToId,
                    storyReplyToId: nil,
                    originalLanguage: item.originalLanguage,
                    clientMessageId: item.clientMessageId,
                    // Lieu partagé rejoué au renvoi — même clé `location` que
                    // le corps REST.
                    location: item.location,
                    sticker: item.sticker
                )
                guard let ack else {
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 502,
                        userInfo: [NSLocalizedDescriptionKey: "Socket ACK missing for offline media dispatch"]
                    )
                }

                for path in uploadedPaths {
                    do { try FileManager.default.removeItem(atPath: path) } catch {
                        logger.warning("media dispatch: failed to remove temp file \(path, privacy: .public): \(error.localizedDescription, privacy: .public)")
                    }
                }

                await reconcileSuccessfulMessageSend(
                    clientMessageId: item.clientMessageId,
                    serverId: ack.messageId,
                    conversationId: item.conversationId
                )
                return
            }

            // Fan-out de partage : les cibles 2..N réclament une COPIE des
            // pièces jointes du message porté par la première — jamais un
            // transfert, qui ferait afficher « Transféré depuis <conversation
            // source> » au destinataire (décision user, invariant produit).
            let copyAttachmentsFromMessageId = try await resolveCopyAttachmentsFromMessageId(for: item)

            let request = SendMessageRequest(
                content: item.content,
                replyToId: item.replyToId,
                forwardedFromId: item.forwardedFromId,
                forwardedFromConversationId: item.forwardedFromConversationId,
                attachmentIds: item.attachmentIds,
                clientMessageId: item.clientMessageId,
                // Lieu partagé rejoué au renvoi, comme pour un post et un
                // commentaire : clé top-level `location`, omise quand nil.
                location: item.location,
                copyAttachmentsFromMessageId: copyAttachmentsFromMessageId,
                // Sticker (#4823) rejoué sous la même clé `sticker` que
                // l'envoi direct — omis quand nil.
                sticker: item.sticker
            )
            let response = try await MessageService.shared.send(
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
            let response = try await MessageService.shared.send(
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
