import Foundation
import MeeshySDK
// Compilé AUSSI dans `MeeshyTests` (`project.yml`) : l'écran de partage y vient
// du module de l'app, qu'aucune extension ne peut importer.
#if !MEESHY_SHARE_EXTENSION
@testable import Meeshy
#endif

/// **Qui envoie, dans l'extension de partage** (#10947).
///
/// L'écran unique appelle `deliver` destinataire par destinataire ; l'extension
/// tient UNE fiche (`SharePendingShare`) pour tout le partage : les fichiers
/// partent une fois vers la première conversation, les suivantes les recopient
/// côté serveur (`copyAttachmentsFromMessageId`). La fiche est écrite AVANT le
/// premier octet envoyé : ce que la feuille n'a pas eu le temps de faire, l'app
/// le reprend à son réveil (`SharePendingSendConsumer`) — y compris après la
/// fermeture. Une ligne servie dit « Envoyé », une ligne différée « En file ».
///
/// **D7 — l'extension n'a pas les clés.** Une conversation chiffrée ne reçoit
/// jamais de clair depuis l'extension : elle est RELAYÉE à l'app
/// (`relayedConversationIds`, remis par la fiche de relais), qui connaît son
/// mode et décide. Le chiffrement se lit sur la conversation RENDUE : une
/// personne n'a pas de mode, sa directe retrouvée ou créée à l'envoi en a un ;
/// une réponse qui ne le dit pas compte comme chiffrée (fail-closed).
@MainActor
final class ExtensionShareDispatcher: ShareDispatching {
    nonisolated deinit {}

    typealias Send = @MainActor (SharePendingShare, ShareSession) async -> SharePendingShare
    typealias CreateDirect = @MainActor (String, ShareSession) async -> CreatedDirect?

    /// La conversation directe retrouvée ou créée à l'envoi, et son chiffrement.
    nonisolated struct CreatedDirect: Equatable, Sendable {
        let id: String
        let isEncrypted: Bool
    }

    private let shareId: String
    private let session: ShareSession?
    private let staged: [ShareStagedMedia]
    private let now: () -> Date
    private let sendShare: Send
    private let createDirect: CreateDirect

    /// La fiche du partage, dès le premier envoi tenté.
    private(set) var share: SharePendingShare?
    /// Les conversations chiffrées remises à l'app (D7), dans l'ordre choisi.
    private(set) var relayedConversationIds: [String] = []
    /// Ce qui part vers elles — la fiche de relais le décrit à l'app.
    private(set) var relayedText: String?
    private(set) var relayedMedia: [ShareStagedMedia] = []

    init(
        shareId: String,
        session: ShareSession?,
        staged: [ShareStagedMedia],
        now: @escaping () -> Date = Date.init,
        sendShare: @escaping Send = { share, session in await ShareSender.send(share: share, session: session) },
        createDirect: @escaping CreateDirect = { userId, session in await ExtensionShareDispatcher.createDirectConversation(with: userId, session: session) }
    ) {
        self.shareId = shareId
        self.session = session
        self.staged = staged
        self.now = now
        self.sendShare = sendShare
        self.createDirect = createDirect
    }

    /// Armé AVANT le premier `await` d'un envoi, jamais désarmé : la fiche est
    /// écrite dès l'entrée de `ShareSender.send`, donc fermer la feuille pendant
    /// l'envoi ne doit plus effacer les fichiers qu'elle décrit.
    private(set) var hasAttemptedSend = false

    /// Les fichiers copiés appartiennent désormais à une fiche : la fermeture ne
    /// doit plus les effacer.
    var holdsStagedMedia: Bool { hasAttemptedSend || !relayedConversationIds.isEmpty }

    var createsGroups: Bool { false }

    func deliver(_ request: ShareSendRequest, to recipient: ShareRecipient) async -> ShareDeliveryOutcome {
        guard let session else { return .failed(reason: Self.signedOutReason) }
        guard let destination = await conversation(for: recipient, session: session) else {
            return .failed(reason: Self.unreachableReason)
        }
        let conversationId = destination.id
        if destination.isEncrypted {
            if !relayedConversationIds.contains(conversationId) { relayedConversationIds.append(conversationId) }
            relayedText = request.subject.composedText(caption: request.caption)
            relayedMedia = keptMedia(of: request.subject)
            return .queued(conversationId: conversationId)
        }
        hasAttemptedSend = true
        var current = share ?? SharePendingShare.make(
            shareId: shareId,
            createdAt: now(),
            content: request.subject.composedText(caption: request.caption),
            media: keptMedia(of: request.subject),
            conversationIds: []
        )
        if !current.targets.contains(where: { $0.conversationId == conversationId }) {
            current.targets.append(SharePendingShare.Target(conversationId: conversationId, clientMessageId: ShareSender.makeClientMessageId()))
        }
        current = await sendShare(current, session)
        share = current
        let served = current.targets.first { $0.conversationId == conversationId }?.state == .sent
        return served ? .sent(conversationId: conversationId) : .queued(conversationId: conversationId)
    }

    func createGroup(with people: [ShareRecipient]) async -> ShareRecipient? { nil }

    func publish(attachment: MessageAttachment, to target: PublicationTarget) async -> Bool { false }

    func resolvedLink(for card: ShareCard) async -> URL? { nil }

    /// La fiche qui remet à l'app ce que l'extension n'a pas pu envoyer elle-même
    /// (D7) — `nil` quand rien n'a été relayé.
    func relayHandoff(createdAt: Date) -> ShareRelayHandoff? {
        guard !relayedConversationIds.isEmpty else { return nil }
        return ShareRelayHandoff(
            shareId: shareId, createdAt: createdAt, text: relayedText,
            media: relayedMedia.map { ShareRelayHandoff.Media(relPath: $0.relPath, mime: $0.mime, bytes: $0.bytes) },
            conversationIds: relayedConversationIds,
            ownerUserId: session?.userId
        )
    }

    /// Les pièces que l'utilisateur a gardées, dans l'ordre choisi à l'écran.
    func keptMedia(of subject: ShareSubject) -> [ShareStagedMedia] {
        subject.incomingMediaIds.compactMap { id in staged.first { $0.relPath == id } }
    }

    // MARK: - Une personne sans conversation

    private func conversation(for recipient: ShareRecipient, session: ShareSession) async -> CreatedDirect? {
        if let conversationId = recipient.conversationId {
            return CreatedDirect(id: conversationId, isEncrypted: recipient.isEncrypted)
        }
        guard let userId = recipient.userId else { return nil }
        return await createDirect(userId, session)
    }

    /// La conversation directe s'ouvre À L'ENVOI, jamais à la sélection — même
    /// requête que l'app (`ConversationCreator`), avec le jeton de l'extension.
    nonisolated static func createDirectConversation(with userId: String, session: ShareSession) async -> CreatedDirect? {
        guard let url = URL(string: "\(session.apiBaseURL)\(ConversationsEndpoint.root.path)"),
              let body = try? JSONSerialization.data(withJSONObject: ["type": "direct", "participantIds": [userId]]) else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        request.timeoutInterval = 10
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let status = (response as? HTTPURLResponse)?.statusCode, (200...299).contains(status) else { return nil }
        return createdDirect(fromResponse: data)
    }

    /// `{ data: { id, encryptionMode } }` — la création est idempotente et rend
    /// la directe EXISTANTE, éventuellement chiffrée. Une réponse qui ne dit pas
    /// le mode explicitement (`null` ou chaîne) compte comme chiffrée : on relaie
    /// plutôt que d'envoyer en clair.
    nonisolated static func createdDirect(fromResponse data: Data) -> CreatedDirect? {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let payload = root["data"] as? [String: Any],
              let id = payload["id"] as? String, !id.isEmpty else { return nil }
        let mode = payload["encryptionMode"]
        let knownClear = payload.keys.contains("encryptionMode") && (mode is NSNull)
        let encrypted = (mode as? String).map { !$0.isEmpty } ?? !knownClear
        return CreatedDirect(id: id, isEncrypted: encrypted)
    }

    private static var signedOutReason: String { ShareSheetCopy.signInTitle }

    private static var unreachableReason: String { ShareSheetCopy.unreachable }
}
