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
        conversationId: String
    ) -> [String: E2EEPlaintextEntry] {
        var adopted: [String: E2EEPlaintextEntry] = [:]
        for index in messages.indices where awaitsPlaintext(messages[index]) {
            let message = messages[index]
            guard let entry = entry(for: message, in: entries), case .readable = entry else { continue }
            guard let readable = adoption(of: entry, by: message, conversationId: conversationId) else {
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

    /// Le message portant son clair, s'il est à SA place ; `nil` sinon.
    static func adoption(of entry: E2EEPlaintextEntry, by message: MeeshyMessage, conversationId: String) -> MeeshyMessage? {
        guard case .readable(let content, let senderUserId) = entry,
              isInPlace(content, senderUserId: senderUserId, for: message, conversationId: conversationId) else { return nil }
        var readable = message
        readable.adoptDecryptedContent(content.text ?? "")
        if let language = content.language, !language.isEmpty { readable.originalLanguage = language }
        return readable
    }

    /// Lit puis pose le clair de tout message scellé du lot.
    @discardableResult
    static func resolve(
        _ messages: inout [MeeshyMessage],
        from endToEnd: any EndToEndMessagingProviding,
        conversationId: String
    ) async -> [String: E2EEPlaintextEntry] {
        let keys = lookupKeys(of: messages)
        guard !keys.isEmpty else { return [:] }
        return apply(await endToEnd.plaintexts(for: keys), to: &messages, conversationId: conversationId)
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
        guard message.messageSource == .user,
              isWritten(content, by: senderUserId, in: conversationId, servedAuthor: message.senderUserId ?? message.senderId)
        else { return false }
        if let written = content.clientMessageId, let served = message.clientMessageId, written != served { return false }
        return cited(content.replyTo) == cited(message.replyToId)
    }

    /// Le socle de la place, partagé par le fil et la ligne de liste (#12968) :
    /// le clair a été écrit POUR cette conversation, et l'auteur que le serveur
    /// annonce est celui que libsignal a authentifié.
    static func isWritten(_ content: E2EEContent, by senderUserId: String, in conversationId: String, servedAuthor: String?) -> Bool {
        content.belongs(to: conversationId) && servedAuthor == senderUserId
    }

    private static func cited(_ id: String?) -> String? {
        id.flatMap { $0.isEmpty ? nil : $0 }
    }
}
