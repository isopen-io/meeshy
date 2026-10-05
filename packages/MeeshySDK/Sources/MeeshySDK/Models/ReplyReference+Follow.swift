import Foundation

// MARK: - La citation SUIT le message cité (#7927)

public extension ReplyReference {

    var isQuotedMessageDeleted: Bool { quotedMessageDeletedAt != nil }

    /// #8631 — la citation a été scellée parce que le message cité ÉPHÉMÈRE a
    /// EXPIRÉ pour ce lecteur, pas parce qu'il a été supprimé : son échéance
    /// est atteinte au plus tard à la date de scellement. C'est la forme que
    /// sert la passerelle (`sealedQuotedMessage` : `expiresAt` = `deletedAt`).
    var isQuotedMessageExpired: Bool {
        guard let sealedAt = quotedMessageDeletedAt, let expiresAt = quotedExpiresAt else { return false }
        return expiresAt <= sealedAt
    }

    /// La citation d'un message SUPPRIMÉ : l'auteur et l'ancre du saut
    /// restent, rien de ce que le message contenait ne reste — ni texte, ni
    /// média, ni ses faits. Cas de confidentialité : un message supprimé ne
    /// doit plus être lisible dans aucune citation.
    ///
    /// `expired` (#8631) : le scellement vient d'une EXPIRATION — la citation
    /// garde alors son échéance (= `date`) pour se dire « expirée ». Une
    /// échéance déjà atteinte à `date` est gardée pour la même raison ; une
    /// échéance future ne dit rien d'une suppression et se perd.
    func tombstoned(at date: Date, expired: Bool = false) -> ReplyReference {
        var sealed = ReplyReference(
            messageId: messageId,
            authorName: authorName,
            previewText: "",
            isMe: isMe,
            authorColor: authorColor,
            authorAvatarUrl: authorAvatarUrl
        )
        sealed.quotedMessageDeletedAt = date
        sealed.quotedExpiresAt = expired ? date : quotedExpiresAt.flatMap { $0 <= date ? $0 : nil }
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
            attachmentFileUrl: attachmentFileUrl,
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
            ),
            storyUnavailable: storyUnavailable
        )
        copy.quotedMessageDeletedAt = quotedMessageDeletedAt
        copy.quotedExpiresAt = quotedExpiresAt
        copy.quotedAudioTracks = quotedAudioTracks
        return copy
    }

    /// Le libellé localisé est l'affaire de l'app : le SDK ne porte que le
    /// fait. Une citation vivante se rend telle quelle.
    func presentingSeal(deleted: String, expired: String) -> ReplyReference {
        guard isQuotedMessageDeleted else { return self }
        return withPreviewText(isQuotedMessageExpired ? expired : deleted)
    }

    /// Le texte du parent MODIFIÉ peut-il remplacer celui de la citation ?
    /// Jamais sur une citation protégée (son texte est un placeholder), ni sur
    /// une story ou une humeur (elles ne citent pas un message), ni sur une
    /// citation déjà scellée.
    var followsParentEdits: Bool {
        !isStoryReply && moodEmoji == nil && !isQuotedMessageDeleted && attachmentIsProtected != true
    }
}
