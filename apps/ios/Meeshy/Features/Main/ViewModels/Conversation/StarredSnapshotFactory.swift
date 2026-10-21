import Foundation
import MeeshySDK

/// L'instantané qu'écrit un message mis en favori : c'est lui que rend `StarredMessagesView`, si bien que la
/// ligne survit aux éditions, aux suppressions `.local` et aux archivages sans rehydrater la bulle d'origine.
enum StarredSnapshotFactory {

    /// `translatedPreview` : la traduction ACTIVE du lecteur, pour que l'aperçu soit ce qu'il a lu et non l'original.
    static func snapshot(
        of message: Message,
        canonicalId: String,
        conversationId: String,
        conversationName: String?,
        conversationAccentColor: String?,
        translatedPreview: String?,
        now: Date
    ) -> StarredMessageSnapshot {
        let attachmentKind = message.attachments.first?.type.rawValue
        let preview = previewText(of: message, attachmentKind: attachmentKind, translatedPreview: translatedPreview)
        return StarredMessageSnapshot(
            id: canonicalId,
            conversationId: conversationId,
            conversationName: conversationName,
            conversationAccentColor: conversationAccentColor,
            senderUserId: message.senderUserId,
            senderName: message.senderName ?? message.senderUsername,
            contentPreview: String(preview.prefix(280)),
            attachmentKind: attachmentKind,
            starredAt: now,
            sentAt: message.createdAt
        )
    }

    private static func previewText(of message: Message, attachmentKind: String?, translatedPreview: String?) -> String {
        if let translated = translatedPreview, !translated.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return translated
        }
        guard message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return message.content }
        guard let kind = attachmentKind.flatMap(MediaKindLabel.kind(forAttachmentRawValue:)) else { return "" }
        return MediaKindLabel.summary(kind)
    }
}
