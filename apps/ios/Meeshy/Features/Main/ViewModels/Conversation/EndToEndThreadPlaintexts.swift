import Combine
import Foundation
import MeeshyE2EE
import MeeshySDK

/// Le fil d'une conversation chiffrée lit le clair que CET appareil a
/// déchiffré ou écrit (#3707, spec § 4.4) : le serveur ne sert que le littéral
/// `[Encrypted]`. Le clair n'est adopté que s'il est à SA place — même
/// conversation, même auteur authentifié par libsignal, même identifiant client
/// — sans quoi un serveur compromis pourrait ranger un message sous un autre.
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

    /// Pose sur chaque message le clair rangé à SA place, et sa langue.
    static func apply(
        _ entries: [String: E2EEPlaintextEntry],
        to messages: inout [MeeshyMessage],
        conversationId: String
    ) {
        for index in messages.indices where awaitsPlaintext(messages[index]) {
            let message = messages[index]
            let entry = entries[message.id] ?? message.clientMessageId.flatMap { entries[$0] }
            guard case .readable(let content, let senderUserId)? = entry,
                  isInPlace(content, senderUserId: senderUserId, for: message, conversationId: conversationId) else { continue }
            messages[index].adoptDecryptedContent(content.text ?? "")
            if let language = content.language, !language.isEmpty { messages[index].originalLanguage = language }
        }
    }

    /// Lit puis pose le clair de tout message scellé du lot.
    static func resolve(_ messages: inout [MeeshyMessage], from endToEnd: any EndToEndMessagingProviding, conversationId: String) async {
        let keys = lookupKeys(of: messages)
        guard !keys.isEmpty else { return }
        apply(await endToEnd.plaintexts(for: keys), to: &messages, conversationId: conversationId)
    }

    /// Chaque enveloppe ouverte de CETTE conversation, sur le fil principal.
    static func openings(of conversationId: String, from endToEnd: any EndToEndMessagingProviding) -> AnyPublisher<Void, Never> {
        endToEnd.opened
            .filter { $0.conversationId == conversationId }
            .map { _ in () }
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }

    static func isInPlace(_ content: E2EEContent, senderUserId: String, for message: MeeshyMessage, conversationId: String) -> Bool {
        guard content.belongs(to: conversationId) else { return false }
        if let author = message.senderUserId, !author.isEmpty, author != senderUserId { return false }
        if let written = content.clientMessageId, let served = message.clientMessageId, written != served { return false }
        return true
    }
}
