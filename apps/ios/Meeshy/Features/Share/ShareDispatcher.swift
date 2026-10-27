import Foundation
import MeeshySDK

/// L'envoi réel : le transfert passe par `MessageForwardService` (chemin unique,
/// hors ligne compris) ; un texte, un lien ou une carte par la file durable
/// (`OfflineQueue`) quand le réseau manque.
///
/// **Le chiffrement se décide sur la conversation RENDUE**, jamais sur la ligne
/// choisie : une personne n'a pas de mode, sa directe — retrouvée ou créée à
/// l'envoi, la création étant idempotente côté passerelle — en a un. Et tant
/// que le partage ne sait pas écrire un chiffré que la passerelle accepte
/// (`encryptedContent`, refusé en 400 sous la forme `isEncrypted` + `content`
/// que porte le SDK), rien ne part vers une conversation chiffrée : le refus
/// est dit à la ligne, rien n'est posté ni mis en file (fail-closed, #9224).
@MainActor
final class LiveShareDispatcher: ShareDispatching {
    nonisolated deinit {}

    private let forwardService: MessageForwardServiceProviding
    private let api: APIClientProviding
    private let queue: OfflineMessageQueueing
    private let isOnline: () -> Bool
    private let conversationCreator: ConversationCreating
    private let postService: PostServiceProviding
    private let currentUserId: () -> String
    private let destinationGuard: EndToEndDestinationGuard

    init(
        forwardService: MessageForwardServiceProviding = MessageForwardService.shared,
        api: APIClientProviding = APIClient.shared,
        queue: OfflineMessageQueueing = OfflineQueue.shared,
        isOnline: @escaping () -> Bool = { NetworkMonitor.shared.isOnline },
        conversationCreator: ConversationCreating = ConversationCreator(),
        postService: PostServiceProviding = PostService.shared,
        currentUserId: @escaping () -> String = { AuthManager.shared.currentUser?.id ?? "" },
        destinationGuard: EndToEndDestinationGuard = EndToEndDestinationGuard()
    ) {
        self.forwardService = forwardService
        self.api = api
        self.queue = queue
        self.isOnline = isOnline
        self.conversationCreator = conversationCreator
        self.postService = postService
        self.currentUserId = currentUserId
        self.destinationGuard = destinationGuard
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

    /// La republication directe du rail (`StoryDirectRepost`), vers la cible
    /// cochée dans la feuille (#12644) — aucun second écrivain.
    func republish(card: ShareCard, to target: PublicationTarget) async -> ShareRepublishOutcome {
        do {
            try await StoryDirectRepost.republish(storyId: card.contentId, as: StoryRepostDestination(target))
            return .published
        } catch {
            return .refused(StoryDirectRepost.failureMessage(for: error))
        }
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
                ? await copyOnDevice(message, chosenDurationSeconds: request.chosenDurationSeconds, to: recipient)
                : Self.outcome(await forwardService.forward(
                    message: message, sourceConversationId: source, to: recipient,
                    chosenDurationSeconds: request.chosenDurationSeconds, forwardedAttachmentIds: nil
                ))
            if case .failed = last { return last }
        }
        return last
    }

    /// **La copie d'un contenu chiffré se fait sur l'appareil** (D7, #9224) : la
    /// passerelle ne recopie rien d'une source chiffrée. Ne repart que du texte
    /// que CET appareil a déchiffré, reconnu par sa provenance
    /// (`isContentDecryptedOnDevice`, #11402) : un échec de déchiffrement laisse
    /// le chiffré dans `content`, un texte forgé par la passerelle ou réécrit
    /// après déchiffrement n'a pas de provenance — aucun ne sort comme texte —,
    /// avec `forwardedFromId` (l'origine du transfert). Un message qui porte des
    /// pièces est refusé en bloc : les pièces d'une source chiffrée ne se
    /// recopient pas encore depuis l'appareil, et un envoi partiel ne s'annonce
    /// jamais « Envoyé ».
    ///
    /// **La copie garde la protection de la source** (#10958), comme un
    /// transfert : la loi de sortie refuse une vue unique et une flamme après
    /// lecture, borne la durée d'une flamme à celle de la source, et le flou
    /// passe à la copie — en ligne comme dans la file hors ligne.
    private func copyOnDevice(_ message: Message, chosenDurationSeconds: Int?, to recipient: ShareRecipient) async -> ShareDeliveryOutcome {
        if let refusal = ForwardRefusalReason.local(for: message) { return .failed(reason: refusal.explanation) }
        guard message.attachments.isEmpty else { return .failed(reason: Self.encryptedPiecesRefusal) }
        guard !message.content.isEmpty, message.isContentDecryptedOnDevice else { return .failed(reason: Self.undecryptedRefusal) }
        guard let destination = await resolveConversation(recipient) else { return .failed(reason: Self.unreachable) }
        return await postText(message.content, forwardedFromId: message.id,
                              protection: Self.copyProtection(of: [message], chosenDurationSeconds: chosenDurationSeconds), to: destination)
    }

    /// La protection qu'une copie emporte de ses sources : la durée la plus
    /// COURTE parmi les flammes (ramenée au choix de l'auteur), le flou dès
    /// qu'une source le porte. Rien pour une source ordinaire.
    private static func copyProtection(of messages: [Message], chosenDurationSeconds: Int?) -> MessageProtectionIntent {
        let duration = messages.compactMap { $0.contentExitLaw.forward.requestedDuration(chosen: chosenDurationSeconds) }.min()
        return MessageProtectionIntent(ephemeralDurationSeconds: duration, isBlurred: messages.contains(where: \.holdsBlur))
    }

    private func postText(_ text: String, forwardedFromId: String? = nil, protection: MessageProtectionIntent = .none,
                          to destination: ResolvedConversation) async -> ShareDeliveryOutcome {
        guard !destination.isEncrypted else { return .failed(reason: Self.encryptedDestinationRefusal) }
        let body = SendMessageRequest(content: text, forwardedFromId: forwardedFromId,
                                      ephemeralDuration: protection.ephemeralDurationSeconds,
                                      isBlurred: protection.isBlurred ? true : nil)
        return await post(body, to: destination.id, offlineContent: text, protection: protection)
    }

    /// D4 : la légende d'un transfert part en message à part, juste après la copie.
    /// Vers une personne, la directe que le transfert vient d'ouvrir se relit
    /// (création idempotente) pour connaître son mode : une légende ne part
    /// jamais en clair dans une directe chiffrée. Elle emporte la protection de
    /// ce qu'elle légende (#10958) : elle ne survit pas à une flamme, elle est
    /// floutée avec un flouté.
    private func appendingCaption(_ request: ShareSendRequest, after outcome: ShareDeliveryOutcome, to recipient: ShareRecipient) async -> ShareDeliveryOutcome {
        let caption = request.caption.trimmingCharacters(in: .whitespacesAndNewlines)
        guard request.captionPlacement == .separateMessage, !caption.isEmpty, outcome.conversationId != nil,
              let destination = await resolveConversation(recipient) else { return outcome }
        _ = await postText(caption, protection: Self.copyProtection(of: Self.captioned(request), chosenDurationSeconds: request.chosenDurationSeconds),
                           to: destination)
        return outcome
    }

    /// Ce que la légende accompagne : les messages gardés, ou le porteur de la pièce.
    private static func captioned(_ request: ShareSendRequest) -> [Message] {
        switch request.subject {
        case .messages(let messages, _, _): return request.keptMessageIds.compactMap { id in messages.first { $0.id == id } }
        case .piece(let message, _, _, _): return [message]
        default: return []
        }
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
        guard let destination = await resolveConversation(recipient) else { return .failed(reason: Self.unreachable) }
        guard !destination.isEncrypted else { return .failed(reason: Self.encryptedDestinationRefusal) }
        let conversationId = destination.id
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
                    copyAttachmentsFromClientMessageId: nil, sticker: nil, deletesSourceFiles: false, createdAt: Date(),
                    protection: .none, originalNames: incoming.media.map(\.originalName)
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
        guard let destination = await resolveConversation(recipient) else { return .failed(reason: Self.unreachable) }
        return await postText(text, to: destination)
    }

    /// En ligne : le POST. Hors ligne : la file durable, rejouée au retour du
    /// réseau même après fermeture de l'app (FIFO, même `clientMessageId`).
    private func post(_ body: SendMessageRequest, to conversationId: String, offlineContent: String?,
                      protection: MessageProtectionIntent = .none) async -> ShareDeliveryOutcome {
        guard isOnline() else {
            guard let offlineContent else { return .failed(reason: Self.unreachable) }
            do {
                try await queue.enqueue(OfflineQueueItem(
                    conversationId: conversationId, content: offlineContent,
                    clientMessageId: body.clientMessageId, forwardedFromId: body.forwardedFromId,
                    protection: protection
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

    /// La conversation où le partage écrit, et son chiffrement.
    private struct ResolvedConversation {
        let id: String
        let isEncrypted: Bool
    }

    /// Une personne sans conversation en reçoit une, À L'ENVOI et jamais à la
    /// sélection ; hors ligne, la création n'est pas tentée. La création étant
    /// idempotente, elle peut rendre une directe existante CHIFFRÉE : son mode
    /// fait foi, pas celui de la ligne choisie. Le chiffrement se lit par la
    /// loi du fil (#12985) : une conversation vue chiffrée de bout en bout par
    /// ce compte l'est, quel que soit le mode servi.
    private func resolveConversation(_ recipient: ShareRecipient) async -> ResolvedConversation? {
        if let conversationId = recipient.conversationId {
            let sealed = await destinationGuard.seals(conversationId, served: [recipient.isEncrypted ? E2EEWire.mode : nil])
            return ResolvedConversation(id: conversationId, isEncrypted: sealed)
        }
        guard let userId = recipient.userId, isOnline(),
              let created = try? await conversationCreator.createDirectConversation(with: userId, currentUserId: currentUserId()) else { return nil }
        return ResolvedConversation(id: created.id, isEncrypted: await destinationGuard.seals(created.id, served: [created.encryptionMode]))
    }

    private static func outcome(_ outcome: ForwardOutcome) -> ShareDeliveryOutcome {
        switch outcome {
        case .sent(let id): return .sent(conversationId: id)
        case .queuedOffline(let id): return .queued(conversationId: id)
        case .failed(let reason): return .failed(reason: reason)
        }
    }

    private static func reason(for error: Error) -> String {
        if let refusal = ForwardRefusalReason.server(error: error) { return refusal.explanation }
        if case let APIError.serverError(_, message) = error { return message ?? genericFailure }
        return (error as? APIError)?.errorDescription ?? error.localizedDescription
    }

    private static var genericFailure: String {
        String(localized: "share.error", defaultValue: "Erreur lors du partage", bundle: .meeshyShare)
    }

    private static var encryptedDestinationRefusal: String {
        String(localized: "share.refused.encrypted-destination",
               defaultValue: "Cette conversation est chiffrée : le partage n’y envoie rien pour l’instant.", bundle: .meeshyShare)
    }

    private static var undecryptedRefusal: String {
        String(localized: "share.refused.undecrypted-source",
               defaultValue: "Ce message n’a pas été déchiffré sur cet appareil : il ne peut pas être copié.", bundle: .meeshyShare)
    }

    private static var encryptedPiecesRefusal: String {
        String(localized: "share.refused.encrypted-pieces",
               defaultValue: "Les pièces d’un message chiffré ne se copient pas encore depuis cet appareil.", bundle: .meeshyShare)
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
