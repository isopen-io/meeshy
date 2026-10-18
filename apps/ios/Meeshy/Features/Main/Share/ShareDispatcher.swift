import Foundation
import MeeshySDK

/// Ce que l'écran remet à l'envoi, pour UN destinataire.
struct ShareSendRequest {
    let subject: ShareSubject
    /// Les messages qui partent, dans l'ordre (le plan a retiré le protégé, D6).
    let keptMessageIds: [String]
    let caption: String
    let captionPlacement: ShareCaption.Placement?
    let grouping: ShareGrouping
    /// La durée choisie d'une flamme, ramenée à la source par la loi.
    let chosenDurationSeconds: Int?
    /// Source chiffrée : la copie se refait sur l'appareil (D7).
    let copyOnDevice: Bool
}

/// L'issue d'un envoi vers UN destinataire, telle que sa ligne la dit (V6).
enum ShareDeliveryOutcome: Equatable {
    case sent(conversationId: String)
    case queued(conversationId: String)
    case failed(reason: String)

    var conversationId: String? {
        switch self {
        case .sent(let id), .queued(let id): return id
        case .failed: return nil
        }
    }
}

/// **Qui envoie** — injecté dans l'écran, pour que l'extension de partage puisse
/// fournir le sien (relais vers l'app, D7) sans singleton de l'app.
@MainActor
protocol ShareDispatching: AnyObject {
    func deliver(_ request: ShareSendRequest, to recipient: ShareRecipient) async -> ShareDeliveryOutcome
    /// « Créer un groupe avec… » (D12) : la conversation créée, ou `nil`.
    func createGroup(with people: [ShareRecipient]) async -> ShareRecipient?
    /// Publier la pièce désignée en story, post ou réel (D2).
    func publish(attachment: MessageAttachment, to target: PublicationTarget) async -> Bool
    /// Le lien suivi d'une carte (story) — `nil` : l'adresse directe reste.
    func resolvedLink(for card: ShareCard) async -> URL?
}

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
        case .text, .link, .card:
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
        var content = message.content
        var encryptionMode: String?
        if recipient.isEncrypted {
            guard let peer = recipient.userId,
                  let sealed = try? await encryptor.encryptMessage(Data(content.utf8), for: peer, conversationId: conversationId) else {
                return .failed(reason: ForwardRefusalReason.encryptedSource.explanation)
            }
            content = sealed.base64EncodedString()
            encryptionMode = "E2EE"
        }
        let body = SendMessageRequest(
            content: content, forwardedFromId: message.id,
            isEncrypted: encryptionMode != nil ? true : nil, encryptionMode: encryptionMode
        )
        return await post(body, to: conversationId, offlineContent: encryptionMode == nil ? content : nil)
    }

    /// D4 : la légende d'un transfert part en message à part, juste après la copie.
    private func appendingCaption(_ request: ShareSendRequest, after outcome: ShareDeliveryOutcome, to recipient: ShareRecipient) async -> ShareDeliveryOutcome {
        let caption = request.caption.trimmingCharacters(in: .whitespacesAndNewlines)
        guard request.captionPlacement == .separateMessage, !caption.isEmpty, let conversationId = outcome.conversationId else { return outcome }
        _ = await post(SendMessageRequest(content: caption), to: conversationId, offlineContent: caption)
        return outcome
    }

    // MARK: - Texte, lien, carte

    private func sendText(_ text: String, to recipient: ShareRecipient) async -> ShareDeliveryOutcome {
        guard let conversationId = await resolveConversation(recipient) else { return .failed(reason: Self.unreachable) }
        return await post(SendMessageRequest(content: text), to: conversationId, offlineContent: text)
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
        String(localized: "share.error", defaultValue: "Erreur lors du partage", bundle: .main)
    }

    private static var unreachable: String {
        String(localized: "forward.error.contact-offline", defaultValue: "Cette personne ne peut pas être jointe hors connexion.", bundle: .main)
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
