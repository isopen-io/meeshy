import Foundation

// MARK: - La citation SUIT le message cité (#7927)

public extension ReplyReference {

    var isQuotedMessageDeleted: Bool { quotedMessageDeletedAt != nil }

    /// La citation d'un message SUPPRIMÉ : l'auteur et l'ancre du saut
    /// restent, rien de ce que le message contenait ne reste — ni texte, ni
    /// média, ni ses faits. Cas de confidentialité : un message supprimé ne
    /// doit plus être lisible dans aucune citation.
    func tombstoned(at date: Date) -> ReplyReference {
        var sealed = ReplyReference(
            messageId: messageId,
            authorName: authorName,
            previewText: "",
            isMe: isMe,
            authorColor: authorColor,
            authorAvatarUrl: authorAvatarUrl
        )
        sealed.quotedMessageDeletedAt = date
        return sealed
    }

    /// La même citation, avec un autre texte — tout le reste préservé.
    func withPreviewText(_ text: String) -> ReplyReference {
        var copy = ReplyReference(
            messageId: messageId,
            authorName: authorName,
            previewText: text,
            isMe: isMe,
            authorColor: authorColor,
            authorAvatarUrl: authorAvatarUrl,
            attachmentType: attachmentType,
            attachmentId: attachmentId,
            attachmentThumbnailUrl: attachmentThumbnailUrl,
            attachmentIsProtected: attachmentIsProtected,
            isStoryReply: isStoryReply,
            storyPublishedAt: storyPublishedAt,
            storyReactionCount: storyReactionCount,
            storyCommentCount: storyCommentCount,
            storyShareCount: storyShareCount,
            storyThumbnailUrl: storyThumbnailUrl,
            moodEmoji: moodEmoji,
            storyAuthorId: storyAuthorId,
            attachmentFacts: QuotedAttachmentFacts(
                thumbHash: attachmentThumbHash, width: attachmentWidth, height: attachmentHeight,
                durationMs: attachmentDurationMs, fileSize: attachmentFileSize,
                pageCount: attachmentPageCount, mimeType: attachmentMimeType
            )
        )
        copy.quotedMessageDeletedAt = quotedMessageDeletedAt
        return copy
    }

    /// Le libellé localisé est l'affaire de l'app : le SDK ne porte que le
    /// fait. Une citation vivante se rend telle quelle.
    func presentingDeletion(label: String) -> ReplyReference {
        isQuotedMessageDeleted ? withPreviewText(label) : self
    }

    /// Le texte du parent MODIFIÉ peut-il remplacer celui de la citation ?
    /// Jamais sur une citation protégée (son texte est un placeholder), ni sur
    /// une story ou une humeur (elles ne citent pas un message), ni sur une
    /// citation déjà scellée.
    var followsParentEdits: Bool {
        !isStoryReply && moodEmoji == nil && !isQuotedMessageDeleted && attachmentIsProtected != true
    }
}
