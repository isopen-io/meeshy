import Combine
import Foundation
import MeeshyE2EE
import MeeshySDK
import os

/// Le fil d'une conversation chiffrée lit le clair que CET appareil a
/// déchiffré ou écrit (#3707, spec § 4.4) : le serveur ne sert que le littéral
/// `[Encrypted]`. Le clair n'est adopté que s'il est à SA place — parole d'un
/// membre, même conversation, même auteur authentifié par libsignal, même
/// identifiant client, même message cité (#12916, audit) — sans quoi un serveur
/// compromis pourrait ranger un message sous un autre, un autre nom ou un autre
/// contexte.
/// Tout ce qui ne s'adopte pas reste scellé (fail-closed), jamais affiché comme
/// chiffré brut.
nonisolated enum EndToEndThreadPlaintexts {

    /// Un message chiffré dont cet appareil n'a pas encore posé le clair.
    static func awaitsPlaintext(_ message: MeeshyMessage) -> Bool {
        message.isEncrypted && message.deletedAt == nil && !message.isContentDecryptedOnDevice
    }

    /// Les clés sous lesquelles le clair a pu être rangé : l'identifiant serveur
    /// (reçu, ou acquitté) et l'identifiant client (envoyé, avant l'acquittement).
    static func lookupKeys(of messages: [MeeshyMessage]) -> [String] {
        messages.filter(awaitsPlaintext).flatMap { [$0.id, $0.clientMessageId].compactMap { $0 } }
    }

    /// Pose sur chaque message le clair rangé à SA place, et sa langue. Rend
    /// ce qui a été posé, par identifiant affiché : la cellule, qui rend la
    /// ligne du magasin (le littéral servi), le repose (#12916).
    @discardableResult
    static func apply(
        _ entries: [String: E2EEPlaintextEntry],
        to messages: inout [MeeshyMessage],
        conversationId: String,
        media: EndToEndMediaPaths = .live
    ) -> [String: E2EEPlaintextEntry] {
        var adopted: [String: E2EEPlaintextEntry] = [:]
        for index in messages.indices where awaitsPlaintext(messages[index]) {
            let message = messages[index]
            guard let entry = entry(for: message, in: entries), case .readable = entry else { continue }
            guard let readable = adoption(of: entry, by: message, conversationId: conversationId, media: media) else {
                Logger.e2ee.warning("e2ee plaintext refused message=\(message.id, privacy: .public): not in place")
                continue
            }
            messages[index] = readable
            adopted[readable.id] = entry
        }
        return adopted
    }

    /// Le clair rangé pour ce message : sous son identifiant serveur, ou sous
    /// son identifiant client seulement si le message est le MIEN — une clé
    /// client se lit dans ma requête, le serveur pourrait la reprendre.
    static func entry(for message: MeeshyMessage, in entries: [String: E2EEPlaintextEntry]) -> E2EEPlaintextEntry? {
        entries[message.id] ?? (message.isMe ? message.clientMessageId.flatMap { entries[$0] } : nil)
    }

    /// Le message portant son clair, s'il est à SA place ; `nil` sinon. Ses
    /// pièces chiffrées sur l'appareil (#10789) remplacent les blobs opaques que
    /// le serveur sert : la bulle lit le pointeur, jamais le blob.
    static func adoption(
        of entry: E2EEPlaintextEntry,
        by message: MeeshyMessage,
        conversationId: String,
        media: EndToEndMediaPaths = .live
    ) -> MeeshyMessage? {
        guard case .readable(let content, let senderUserId) = entry,
              isInPlace(content, senderUserId: senderUserId, for: message, conversationId: conversationId) else { return nil }
        var readable = message
        readable.adoptDecryptedContent(content.text ?? "")
        if let language = content.language, !language.isEmpty { readable.originalLanguage = language }
        // Les pièces d'un message chiffré sont CELLES DU CONTENU authentifié, et
        // aucune autre : une pièce que le serveur ajoute à la ligne ne s'affiche
        // pas sous le message d'un pair, et un pointeur dont le blob n'est pas
        // rattaché à CETTE ligne reste illisible (audit du 2026-10-25). Une vue
        // unique ouverte ou un éphémère échu ne remontrent rien.
        let pointers = EndToEndAttachmentOverlay.isSpent(message) ? [] : (content.attachments ?? [])
        readable.attachments = EndToEndAttachmentOverlay.attachments(
            for: pointers, messageId: message.id, uploadedBy: message.senderId, createdAt: message.createdAt,
            servedBlobIds: Set(message.attachments.map(\.id)), paths: media
        )
        readable.messageType = pointers.isEmpty ? .text : EndToEndAttachmentOverlay.messageType(of: pointers)
        return readable
    }

    /// Lit puis pose le clair de tout message scellé du lot.
    @discardableResult
    static func resolve(
        _ messages: inout [MeeshyMessage],
        from endToEnd: any EndToEndMessagingProviding,
        conversationId: String,
        media: EndToEndMediaPaths = .live
    ) async -> [String: E2EEPlaintextEntry] {
        let keys = lookupKeys(of: messages)
        guard !keys.isEmpty else { return [:] }
        return apply(await endToEnd.plaintexts(for: keys), to: &messages, conversationId: conversationId, media: media)
    }

    /// Chaque enveloppe ouverte de CETTE conversation, sur le fil principal.
    static func openings(of conversationId: String, from endToEnd: any EndToEndMessagingProviding) -> AnyPublisher<Void, Never> {
        endToEnd.opened
            .filter { $0.conversationId == conversationId }
            .map { _ in () }
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }

    /// L'auteur se lit sur la ligne (`senderUserId`, sinon `senderId`, que le
    /// magasin résout en identifiant utilisateur) : une ligne sans auteur
    /// reconnaissable reste scellée.
    static func isInPlace(_ content: E2EEContent, senderUserId: String, for message: MeeshyMessage, conversationId: String) -> Bool {
        let author = announcedAuthor(of: message)
        guard content.belongs(to: conversationId), message.messageSource == .user,
              !author.isEmpty, author == senderUserId else { return false }
        if let written = content.clientMessageId, let served = message.clientMessageId, written != served { return false }
        return cited(content.replyTo) == cited(message.replyToId)
    }

    private static func cited(_ id: String?) -> String? {
        id.flatMap { $0.isEmpty ? nil : $0 }
    }

    /// L'auteur que le message ANNONCE, quel que soit son chemin d'arrivée
    /// (#11232, #12757). REST et socket portent `senderUserId`, leur `senderId`
    /// désignant le Participant. Une ligne GRDB d'un pair n'a pas
    /// `senderUserId` (`MessageRecord.toMessage` ne le pose que pour le
    /// lecteur) : son `senderId` est l'utilisateur résolu à l'ingestion. Sans
    /// auteur annoncé, aucun clair ne s'adopte.
    static func announcedAuthor(of message: MeeshyMessage) -> String {
        guard let author = message.senderUserId, !author.isEmpty else { return message.senderId }
        return author
    }
}
