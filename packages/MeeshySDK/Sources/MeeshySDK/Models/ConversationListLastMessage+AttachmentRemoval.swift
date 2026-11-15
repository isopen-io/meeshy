import Foundation

extension ConversationListLastMessage {

    /// Ce que la ligne de liste devient quand une pièce quitte son dernier message.
    public enum AfterAttachmentRemoval {
        /// La ligne ne décrit pas ce message, ou la pièce n'y figurait déjà plus (rejeu).
        case unchanged
        /// Plus ni légende ni pièce : le message est mort, la ligne revient au survivant.
        case emptied
        case updated([MeeshyConversation])
    }

    /// Retire la pièce de l'aperçu de la ligne dont `messageId` est le dernier message.
    ///
    /// `fallbackAttachments` sont les pièces que le cache des messages connaît : une ligne servie par la liste REST
    /// n'en porte que le résumé. Seul le groupe des pièces change — la légende, ses traductions et ce qui QUALIFIE
    /// le message (chiffré, vue unique, flouté, durée) restent tels quels, donc une protection ne se perd pas.
    public static func removingAttachment(
        _ attachmentId: String,
        ofMessage messageId: String,
        conversationId: String,
        fallbackAttachments: [MeeshyMessageAttachment],
        in conversations: [MeeshyConversation]
    ) -> AfterAttachmentRemoval {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }),
              conversations[index].lastMessageId == messageId
        else { return .unchanged }
        let row = conversations[index]
        let known = row.lastMessageAttachments.isEmpty ? fallbackAttachments : row.lastMessageAttachments
        guard known.contains(where: { $0.id == attachmentId }) else { return .unchanged }
        let remaining = known.filter { $0.id != attachmentId }
        guard !AttachmentRemoval.leavesNothing(
            text: row.lastMessagePreview, isEncrypted: row.lastMessageNature?.isEncrypted ?? false,
            remaining: remaining.count
        ) else { return .emptied }
        var updated = conversations
        updated[index].lastMessageAttachments = remaining
        updated[index].lastMessageAttachmentCount = remaining.count
        updated[index].lastMessageNature = row.lastMessageNature?
            .replacingAttachmentSummary(LastMessageAttachmentSummary(attachments: remaining))
        return .updated(updated)
    }
}
