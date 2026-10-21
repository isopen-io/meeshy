import Foundation
import MeeshySDK
import os

/// Qui a écrit la ligne optimiste : l'identifiant d'expéditeur et son profil,
/// lus UNE fois par l'hôte.
struct OptimisticAuthor {
    let senderId: String
    let sender: MeeshyUser?
}

/// Tout ce qu'une bulle optimiste de média porte avant que l'upload TUS ne
/// soit terminé. `replyReference` est DÉJÀ résolue par l'hôte : ce type ne lit
/// pas la fenêtre de messages.
struct OptimisticMediaDraft {
    let conversationId: String
    let tempId: String
    let content: String
    let attachments: [MeeshyMessageAttachment]
    let messageType: Message.MessageType
    let replyToId: String?
    let storyReplyToId: String?
    let replyReference: ReplyReference?
    let originalLanguage: String
    let sticker: MessageSticker?
    let protection: MessageProtectionIntent
}

typealias ThreadCacheMerge = @Sendable (_ conversationId: String, _ mutate: @Sendable ([Message]) -> [Message]) async -> Void

protocol OptimisticMessageStagerProviding {
    func stageOffline(
        _ outgoing: OutgoingMessage,
        clientMessageId: MessageID,
        intent: MessageProtectionIntent,
        author: OptimisticAuthor,
        conversationId: String,
        language: String,
        effectFlags: UInt32
    ) async -> Message

    func stageOnline(
        _ outgoing: OutgoingMessage,
        context: SendAttemptContext,
        author: OptimisticAuthor,
        conversationId: String,
        replyReference: ReplyReference?,
        effectFlags: UInt32
    ) async

    func stageMedia(_ draft: OptimisticMediaDraft, author: OptimisticAuthor)
}

/// L'adaptateur de persistance de la ligne OPTIMISTE — texte hors ligne, texte
/// en ligne, média — et de l'aperçu de liste qui l'accompagne. La ligne naît
/// dans GRDB (l'observation du store la fait apparaître) AVANT tout ACK ;
/// l'hôte décide quoi poser, ce type l'écrit.
///
/// `listSink` n'est PAS le moteur injecté dans le modèle de vue : l'aperçu de
/// liste a toujours eu pour récepteur `ConversationSyncEngine.shared`.
struct OptimisticMessageStager: OptimisticMessageStagerProviding {
    let persistence: any OptimisticMessagePersisting & Sendable
    var listSink: any ConversationSyncEngineProviding = ConversationSyncEngine.shared
    var threadCache: ThreadCacheMerge = { conversationId, mutate in
        await CacheCoordinator.shared.messages.mergeUpdate(for: conversationId, mutate: mutate)
    }

    // MARK: Hors ligne

    /// Hors ligne : la ligne optimiste puis l'aperçu de liste. Si l'outbox
    /// échoue ensuite, la bulle passe en `.failed` : l'utilisateur peut renvoyer.
    func stageOffline(
        _ outgoing: OutgoingMessage,
        clientMessageId: MessageID,
        intent: MessageProtectionIntent,
        author: OptimisticAuthor,
        conversationId: String,
        language: String,
        effectFlags: UInt32
    ) async -> Message {
        let offlineMessage = await insertOfflineRow(
            outgoing, clientMessageId: clientMessageId, intent: intent, author: author,
            conversationId: conversationId, language: language, effectFlags: effectFlags
        )

        let threadCache = threadCache
        Task.detached(priority: .utility) {
            await threadCache(conversationId) { cached in
                let cachedIds = Set(cached.map(\.id))
                guard !cachedIds.contains(offlineMessage.id) else { return cached }
                return (cached + [offlineMessage]).sorted { $0.createdAt < $1.createdAt }
            }
        }

        let offlineFacet = LastMessageFacet(message: offlineMessage, preview: outgoing.text)
        let listSink = listSink
        Task {
            await listSink.updateConversationAfterSend(offlineFacet, conversationId: conversationId)
        }
        return offlineMessage
    }

    private func insertOfflineRow(
        _ outgoing: OutgoingMessage,
        clientMessageId: MessageID,
        intent: MessageProtectionIntent,
        author: OptimisticAuthor,
        conversationId: String,
        language: String,
        effectFlags: UInt32
    ) async -> Message {
        let localId = clientMessageId.rawValue
        let relation = outgoing.relation
        let offlineMessage = Message(
            id: localId,
            conversationId: conversationId,
            senderId: author.senderId,
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
            senderId: author.senderId,
            sender: author.sender,
            text: outgoing.text,
            originalLanguage: language,
            messageType: "text",
            replyToId: relation.replyToId,
            storyReplyToId: relation.storyReplyToId,
            forwardedFromId: relation.forwardedFromId,
            forwardedFromConversationId: relation.forwardedFromConversationId,
            replyToJson: nil,
            effectFlags: effectFlags,
            maxViewOnceCount: intent.maxViewOnceCount,
            locationJson: OptimisticRecordColumns.locationJson(outgoing.location, id: localId),
            stickerJson: OptimisticRecordColumns.stickerJson(outgoing.sticker, id: localId),
            now: Date(),
            ephemeralDuration: intent.ephemeralDurationSeconds
        )
        do {
            try await persistence.insertOptimistic(offlineRecord)
        } catch {
            Logger.messages.error("offline insertOptimistic failed: \(error.localizedDescription, privacy: .public)")
        }
        return offlineMessage
    }

    // MARK: En ligne

    /// La ligne optimiste d'un envoi en ligne, posée dans GRDB (la
    /// observation du store la fait apparaître) puis l'aperçu de liste, avant
    /// tout ACK.
    func stageOnline(
        _ outgoing: OutgoingMessage,
        context: SendAttemptContext,
        author: OptimisticAuthor,
        conversationId: String,
        replyReference replyRef: ReplyReference?,
        effectFlags: UInt32
    ) async {
        let tempId = context.clientMessageId.rawValue
        let intent = context.intent
        let relation = outgoing.relation
        let resolvedAttachments = outgoing.attachments.previews ?? []
        let resolvedEphemeralDuration = intent.ephemeralDurationSeconds
        let optimisticRecord = OptimisticTextRecordBuilder.record(
            localId: tempId,
            conversationId: conversationId,
            senderId: author.senderId,
            sender: author.sender,
            text: outgoing.text,
            originalLanguage: context.language,
            messageType: outgoing.optimisticMessageType.rawValue,
            replyToId: relation.replyToId,
            storyReplyToId: relation.storyReplyToId,
            forwardedFromId: relation.forwardedFromId,
            forwardedFromConversationId: relation.forwardedFromConversationId,
            replyToJson: replyRef.flatMap(encodedReplyReference),
            effectFlags: effectFlags,
            maxViewOnceCount: intent.maxViewOnceCount,
            locationJson: OptimisticRecordColumns.locationJson(outgoing.location, id: tempId),
            stickerJson: OptimisticRecordColumns.stickerJson(outgoing.sticker, id: tempId),
            now: Date(),
            ephemeralDuration: resolvedEphemeralDuration
        )
        Logger.messages.info("SendFlow insertOptimistic START tempId=\(tempId, privacy: .public) convId=\(conversationId, privacy: .public)")
        do {
            try await persistence.insertOptimistic(optimisticRecord)
            Logger.messages.debug("SendFlow insertOptimistic OK tempId=\(tempId, privacy: .public) state=.sending convId=\(conversationId, privacy: .public)")
            await listSink.updateConversationAfterSend(
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

    // MARK: Média

    /// Insère un MessageRecord optimiste GRDB pour un message média (image,
    /// vidéo, audio, fichier) AVANT que l'upload TUS ne soit terminé. Les
    /// attachments fournis pointent sur les fichiers locaux (file:// URLs)
    /// pour que la bulle affiche l'image / le player audio immédiatement —
    /// y compris hors-ligne. Le store observation surface la nouvelle ligne
    /// dans `messages` automatiquement, donc l'appelant n'a PAS besoin de
    /// faire `messages.append(...)` en parallèle (cela serait écrasé à la
    /// prochaine emission du publisher).
    func stageMedia(_ draft: OptimisticMediaDraft, author: OptimisticAuthor) {
        let now = Date()
        let tempId = draft.tempId
        let attachmentsJson = draft.attachments.isEmpty ? nil : bestEffort("send.attachmentsJson", category: .messages) { try JSONEncoder().encode(draft.attachments) }
        let record = OptimisticMediaRecordBuilder.record(
            tempId: tempId,
            conversationId: draft.conversationId,
            senderId: author.senderId,
            sender: author.sender,
            content: draft.content,
            originalLanguage: draft.originalLanguage,
            messageType: draft.messageType,
            replyToId: draft.replyToId,
            storyReplyToId: draft.storyReplyToId,
            replyToJson: draft.replyReference.flatMap(encodedReplyReference),
            attachmentsJson: attachmentsJson,
            stickerJson: OptimisticRecordColumns.stickerJson(draft.sticker, id: tempId),
            protection: draft.protection,
            now: now
        )
        let persistence = persistence
        let listSink = listSink
        let recordConversationId = record.conversationId
        let attachmentCount = draft.attachments.count
        // Captured for the conversation-list optimistic update below (computed on
        // the MainActor before the detached insert).
        let listFacet = LastMessageFacet.sent(
            id: tempId,
            text: draft.content,
            at: now,
            attachments: draft.attachments,
            ephemeralDuration: draft.protection.ephemeralDurationSeconds,
            originalLanguage: draft.originalLanguage
        )
        Task.detached(priority: .userInitiated) {
            do {
                try await persistence.insertOptimistic(record)
                Logger.messages.debug("SendFlow insertOptimisticMedia OK tempId=\(tempId, privacy: .public) convId=\(recordConversationId, privacy: .public) attachments=\(attachmentCount, privacy: .public)")
                // Local-first: surface the media message in the conversation list
                // immediately (preview + bump to top), before any server ACK —
                // the media path previously never updated the list optimistically.
                await listSink.updateConversationAfterSend(listFacet, conversationId: recordConversationId)
            } catch {
                Logger.messages.error("SendFlow insertOptimisticMedia FAILED tempId=\(tempId, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// Un JSON qui ne s'encode pas ne bloque pas la ligne optimiste : il est
    /// journalisé, et la colonne reste vide.
    private func encodedReplyReference(_ reference: ReplyReference) -> Data? {
        bestEffort("send.replyToJson", category: .messages) { try JSONEncoder().encode(reference) }
    }
}
