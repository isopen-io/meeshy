import Foundation
import MeeshyE2EE
import MeeshySDK

/// La ligne de liste d'une conversation chiffrée de bout en bout lit le clair
/// que CET appareil tient de son dernier message (#12968) : ce qu'il a écrit
/// (`EndToEndSendSealer` le range sous l'identifiant serveur à l'acquittement)
/// ou ce que libsignal a ouvert. Même coffre et même socle de place que le fil
/// (`EndToEndThreadPlaintexts.isWritten`) : même conversation, même auteur
/// authentifié. Le clair n'est tenu qu'en mémoire par la liste, jamais écrit
/// dans le cache des conversations ni renvoyé au serveur. Absent ou
/// indéchiffrable, la ligne garde « Message chiffré ».
nonisolated enum ConversationListEndToEndTexts {

    /// Un dernier message scellé par le serveur, que la ligne nomme.
    static func awaitsPlaintext(_ conversation: Conversation) -> Bool {
        conversation.lastMessageNature?.isEncrypted == true && !(conversation.lastMessageId ?? "").isEmpty
    }

    /// Le clair de la ligne, s'il est à SA place ; `nil` sinon.
    static func adoption(of entry: E2EEPlaintextEntry?, for conversation: Conversation) -> ConversationPreviewDeviceText? {
        guard awaitsPlaintext(conversation), let messageId = conversation.lastMessageId,
              case .readable(let content, let senderUserId)? = entry,
              EndToEndThreadPlaintexts.isWritten(
                content, by: senderUserId, in: conversation.id, servedAuthor: conversation.lastMessageSenderUserId
              )
        else { return nil }
        return ConversationPreviewDeviceText(messageId: messageId, text: content.text ?? "", language: content.language)
    }

    /// Les clairs déjà tenus qui valent encore : même conversation, même
    /// dernier message. Un dernier message qui change fait tomber le sien.
    static func kept(
        _ known: [String: ConversationPreviewDeviceText], in conversations: [Conversation]
    ) -> [String: ConversationPreviewDeviceText] {
        conversations.reduce(into: [String: ConversationPreviewDeviceText]()) { kept, conversation in
            guard awaitsPlaintext(conversation), let text = known[conversation.id],
                  text.messageId == conversation.lastMessageId else { return }
            kept[conversation.id] = text
        }
    }

    /// Lit le coffre pour les lignes scellées qui n'ont pas encore leur clair,
    /// et rend la carte complète, par conversation.
    static func resolve(
        _ conversations: [Conversation],
        known: [String: ConversationPreviewDeviceText],
        from endToEnd: any EndToEndMessagingProviding
    ) async -> [String: ConversationPreviewDeviceText] {
        let kept = kept(known, in: conversations)
        let pending = conversations.filter { awaitsPlaintext($0) && kept[$0.id] == nil }
        let ids = pending.compactMap(\.lastMessageId)
        guard !ids.isEmpty else { return kept }
        let entries = await endToEnd.plaintexts(for: ids)
        return pending.reduce(into: kept) { texts, conversation in
            guard let text = adoption(of: conversation.lastMessageId.flatMap { entries[$0] }, for: conversation) else { return }
            texts[conversation.id] = text
        }
    }
}
