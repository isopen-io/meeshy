import Foundation
import MeeshySDK

/// L'envoi réel : le transfert passe par `MessageForwardService` (chemin unique,
/// hors ligne compris) ; un texte, un lien ou une carte par la file durable
/// (`OfflineQueue`) quand le réseau manque.
@MainActor
final class LiveShareDispatcher: ShareDispatching {
    nonisolated deinit {}

    private let forwardService: MessageForwardServiceProviding
    private let api: APIClientProviding
    private let queue: OfflineMessageQueueing
    private let isOnline: () -> Bool
    private let conversationCreator: ConversationCreating
    private let encryptor: DirectMessageEncrypting
    private let postService: PostServiceProviding
    private let currentUserId: () -> String

    init(
        forwardService: MessageForwardServiceProviding = MessageForwardService.shared,
        api: APIClientProviding = APIClient.shared,
        queue: OfflineMessageQueueing = OfflineQueue.shared,
        isOnline: @escaping () -> Bool = { NetworkMonitor.shared.isOnline },
        conversationCreator: ConversationCreating = ConversationCreator(),
        encryptor: DirectMessageEncrypting = SessionManager.shared,
        postService: PostServiceProviding = PostService.shared,
        currentUserId: @escaping () -> String = { AuthManager.shared.currentUser?.id ?? "" }
    ) {
        self.forwardService = forwardService
        self.api = api
        self.queue = queue
        self.isOnline = isOnline
        self.conversationCreator = conversationCreator
        self.encryptor = encryptor
        self.postService = postService
        self.currentUserId = currentUserId
    }

    func deliver(_ request: ShareSendRequest, to recipient: ShareRecipient) async -> ShareDeliveryOutcome {
        let outcome: ShareDeliveryOutcome
        switch request.subject {
        case .messages(let messages, let source, _):
            let kept = request.keptMessageIds.compactMap { id in messages.first { $0.id == id } }
            outcome = await forward(kept, source: source, request: request, to: recipient)
        case .piece(let message, let attachmentId, let source, _):
            outcome = Self.outcome(await forwardService.forward(
                message: message, sourceConversationId: source, to: recipient,
                chosenDurationSeconds: request.chosenDurationSeconds, forwardedAttachmentIds: [attachmentId]
            ))
        case .incoming(let incoming) where !incoming.media.isEmpty:
            return await sendIncomingMedia(incoming, request: request, to: recipient)
        case .text, .link, .card, .incoming:
            guard let text = request.subject.composedText(caption: request.caption) else {
                return .failed(reason: Self.genericFailure)
            }
            let sent = await sendText(text, to: recipient)
            // Une story ENVOYÉE allume l'anneau « Envoyer » de son lecteur
            // (directive porteur 2026-10-01) — la passerelle ne sert pas ce geste.
            if case .card(let card) = request.subject, card.kind == .story, sent.conversationId != nil {
                StoryViewerParticipationStore.shared.note(.sent, storyId: card.contentId)
            }
            return sent
        }
        return await appendingCaption(request, after: outcome, to: recipient)
    }

    func createGroup(with people: [ShareRecipient]) async -> ShareRecipient? {
        let ids = people.compactMap(\.userId)
        guard ids.count >= 2, isOnline() else { return nil }
        let body = CreateGroupBody(type: "group", title: nil, participantIds: ids)
        guard let response: APIResponse<APIConversation> = try? await api.post(ConversationsEndpoint.root, body: body) else { return nil }
        return ShareRecipient(conversation: response.data.toConversation(currentUserId: currentUserId()))
    }

    func publish(attachment: MessageAttachment, to target: PublicationTarget) async -> Bool {
        (try? await postService.publishAttachment(
            attachmentId: attachment.id, target: target, content: nil, capturedInApp: attachment.capturedInApp
        )) != nil
    }

    func resolvedLink(for card: ShareCard) async -> URL? {
        guard card.kind == .story, isOnline() else { return nil }
        let body = StoryShareLinkRequest(platform: "system", generateLink: true)
        guard let response: APIResponse<PostShareResult> = try? await api.post(PostsEndpoint.byPostIdShare(postId: card.contentId), body: body),
              let short = response.data.shortUrl else { return nil }
        return URL(string: short)
    }

    // MARK: - Transfert

    /// Les messages partent dans l'ordre ; le premier échec arrête la série pour
    /// ce destinataire. Une source chiffrée se recopie sur l'appareil (D7).
    private func forward(_ messages: [Message], source: String?, request: ShareSendRequest, to recipient: ShareRecipient) async -> ShareDeliveryOutcome {
        var last: ShareDeliveryOutcome = .failed(reason: Self.genericFailure)
        for message in messages {
            last = request.copyOnDevice
                ? await copyOnDevice(message, to: recipient)
                : Self.outcome(await forwardService.forward(
                    message: message, sourceConversationId: source, to: recipient,
                    chosenDurationSeconds: request.chosenDurationSeconds, forwardedAttachmentIds: nil
                ))
            if case .failed = last { return last }
        }
        return last
    }

    /// **La copie d'un contenu chiffré se fait sur l'appareil** (D7, #9224) : la
    /// passerelle ne recopie rien d'une source chiffrée. Le texte, déchiffré ici,
    /// repart avec `forwardedFromId` (la provenance) ; vers une conversation
    /// directe chiffrée, il est rechiffré pour le pair. Une pièce chiffrée ne se
    /// recopie pas encore depuis l'appareil : elle n'est pas envoyée.
    private func copyOnDevice(_ message: Message, to recipient: ShareRecipient) async -> ShareDeliveryOutcome {
        guard !message.content.isEmpty else { return .failed(reason: ForwardRefusalReason.encryptedSource.explanation) }
        guard let conversationId = await resolveConversation(recipient) else { return .failed(reason: Self.unreachable) }
        return await postText(message.content, forwardedFromId: message.id, to: recipient, conversationId: conversationId)
    }

    /// **Rien ne part en clair vers une conversation chiffrée** (D7, #9224,
    /// fail-closed). Vers une directe chiffrée, le texte est rechiffré pour le
    /// pair ; vers un groupe chiffré, l'appareil ne sait pas encore le faire —
    /// `nil`, et rien ne part.
    private func sealed(_ content: String, for recipient: ShareRecipient, conversationId: String) async -> (content: String, encryptionMode: String?)? {
        guard recipient.isEncrypted else { return (content, nil) }
        guard let peer = recipient.userId,
              let box = try? await encryptor.encryptMessage(Data(content.utf8), for: peer, conversationId: conversationId) else { return nil }
        return (box.base64EncodedString(), "E2EE")
    }

    private func postText(_ text: String, forwardedFromId: String? = nil, to recipient: ShareRecipient, conversationId: String) async -> ShareDeliveryOutcome {
        guard let sealed = await sealed(text, for: recipient, conversationId: conversationId) else {
            return .failed(reason: ForwardRefusalReason.encryptedSource.explanation)
        }
        let body = SendMessageRequest(
            content: sealed.content, forwardedFromId: forwardedFromId,
            isEncrypted: sealed.encryptionMode != nil ? true : nil, encryptionMode: sealed.encryptionMode
        )
        return await post(body, to: conversationId, offlineContent: sealed.encryptionMode == nil ? sealed.content : nil)
    }

    /// D4 : la légende d'un transfert part en message à part, juste après la copie.
    private func appendingCaption(_ request: ShareSendRequest, after outcome: ShareDeliveryOutcome, to recipient: ShareRecipient) async -> ShareDeliveryOutcome {
        let caption = request.caption.trimmingCharacters(in: .whitespacesAndNewlines)
        guard request.captionPlacement == .separateMessage, !caption.isEmpty, let conversationId = outcome.conversationId else { return outcome }
        _ = await postText(caption, to: recipient, conversationId: conversationId)
        return outcome
    }

    // MARK: - Ce qu'une autre app a remis (relais de l'extension)

    /// Le message qui porte les fichiers d'un partage relayé — les suivants les
    /// recopient côté serveur, comme la reprise d'une fiche d'envoi.
    private var incomingOriginClientMessageId: String?

    /// Ce qu'une autre app a remis, relayé par l'extension : la file durable
    /// (`OfflineQueue`) recopie les fichiers à l'enfilement et les envoie au
    /// retour du réseau, même après fermeture. Une pièce ne se chiffre pas
    /// encore sur l'appareil : vers une conversation chiffrée, rien ne part.
    private func sendIncomingMedia(_ incoming: ShareIncoming, request: ShareSendRequest, to recipient: ShareRecipient) async -> ShareDeliveryOutcome {
        guard !recipient.isEncrypted else { return .failed(reason: ForwardRefusalReason.encryptedSource.explanation) }
        guard let conversationId = await resolveConversation(recipient) else { return .failed(reason: Self.unreachable) }
        let files = incoming.media.compactMap(\.fileURL)
        guard files.count == incoming.media.count, !files.isEmpty else { return .failed(reason: Self.genericFailure) }
        let content = request.subject.composedText(caption: request.caption)
        let clientMessageId = "cid_\(UUID().uuidString.lowercased())"
        do {
            if let origin = incomingOriginClientMessageId {
                try await queue.enqueue(OfflineQueueItem(
                    id: UUID().uuidString, clientMessageId: clientMessageId, conversationId: conversationId,
                    content: content ?? "", originalLanguage: nil, replyToId: nil, forwardedFromId: nil,
                    forwardedFromConversationId: nil, attachmentIds: nil, localAudioPath: nil,
                    copyAttachmentsFromClientMessageId: origin, copyAttachmentsFromServerMessageId: nil, createdAt: Date()
                ))
            } else {
                try await queue.enqueueMedia(
                    sourceMediaURLs: files, kinds: incoming.media.map { Self.attachmentKind(for: $0.mimeType) },
                    conversationId: conversationId, content: content, clientMessageId: clientMessageId,
                    originalLanguage: nil, replyToId: nil, forwardedFromId: nil, forwardedFromConversationId: nil,
                    copyAttachmentsFromClientMessageId: nil, deletesSourceFiles: false, createdAt: Date()
                )
                incomingOriginClientMessageId = clientMessageId
            }
            return .queued(conversationId: conversationId)
        } catch {
            return .failed(reason: error.localizedDescription)
        }
    }

    /// Le type que la file attend pour chaque fichier — même table que la
    /// reprise des fiches de l'extension (`SharePendingSendConsumer`).
    private static func attachmentKind(for mime: String) -> String {
        if mime.hasPrefix("image/") { return "image" }
        if mime.hasPrefix("video/") { return "video" }
        if mime.hasPrefix("audio/") { return "audio" }
        return "document"
    }

    // MARK: - Texte, lien, carte

    private func sendText(_ text: String, to recipient: ShareRecipient) async -> ShareDeliveryOutcome {
        guard let conversationId = await resolveConversation(recipient) else { return .failed(reason: Self.unreachable) }
        return await postText(text, to: recipient, conversationId: conversationId)
    }

    /// En ligne : le POST. Hors ligne : la file durable, rejouée au retour du
    /// réseau même après fermeture de l'app (FIFO, même `clientMessageId`).
    private func post(_ body: SendMessageRequest, to conversationId: String, offlineContent: String?) async -> ShareDeliveryOutcome {
        guard isOnline() else {
            guard let offlineContent else { return .failed(reason: Self.unreachable) }
            do {
                try await queue.enqueue(OfflineQueueItem(
                    conversationId: conversationId, content: offlineContent,
                    clientMessageId: body.clientMessageId, forwardedFromId: body.forwardedFromId
                ))
                return .queued(conversationId: conversationId)
            } catch {
                return .failed(reason: error.localizedDescription)
            }
        }
        do {
            let _: APIResponse<SendMessageResponseData> = try await api.post(ConversationsEndpoint.byIdMessages(id: conversationId), body: body)
            return .sent(conversationId: conversationId)
        } catch {
            return .failed(reason: Self.reason(for: error))
        }
    }

    /// Une personne sans conversation en reçoit une, À L'ENVOI et jamais à la
    /// sélection ; hors ligne, la création n'est pas tentée.
    private func resolveConversation(_ recipient: ShareRecipient) async -> String? {
        if let conversationId = recipient.conversationId { return conversationId }
        guard let userId = recipient.userId, isOnline() else { return nil }
        return try? await conversationCreator.createDirectConversation(with: userId, currentUserId: currentUserId()).id
    }

    private static func outcome(_ outcome: ForwardOutcome) -> ShareDeliveryOutcome {
        switch outcome {
        case .sent(let id): return .sent(conversationId: id)
        case .queuedOffline(let id): return .queued(conversationId: id)
        case .failed(let reason): return .failed(reason: reason)
        }
    }

    private static func reason(for error: Error) -> String {
        if case let APIError.serverError(_, message) = error {
            return ForwardRefusalReason.server(message: message)?.explanation ?? message ?? genericFailure
        }
        return (error as? APIError)?.errorDescription ?? error.localizedDescription
    }

    private static var genericFailure: String {
        String(localized: "share.error", defaultValue: "Erreur lors du partage", bundle: .meeshyShare)
    }

    private static var unreachable: String {
        String(localized: "forward.error.contact-offline", defaultValue: "Cette personne ne peut pas être jointe hors connexion.", bundle: .meeshyShare)
    }

    /// Corps du POST `/posts/<id>/share` qui mint le lien suivi d'une story ;
    /// `generateLink` réutilise le lien existant du partageur.
    private struct StoryShareLinkRequest: Encodable {
        let platform: String
        let generateLink: Bool
    }

    private struct CreateGroupBody: Encodable {
        let type: String
        let title: String?
        let participantIds: [String]
    }
}
