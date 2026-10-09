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
            authorAvatarUrl: authorAvatarUrl,
            authorUserId: authorUserId
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
            storyUnavailable: storyUnavailable,
            authorUserId: authorUserId
        )
        copy.quotedMessageDeletedAt = quotedMessageDeletedAt
        copy.quotedExpiresAt = quotedExpiresAt
        copy.quotedExitNature = quotedExitNature
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

// MARK: - Ce que la citation laisse sortir

public extension ReplyReference {

    /// **Le contenu cité peut-il SORTIR avec le message qui le cite ?** (#9573)
    ///
    /// Une carte « Imager » peint la citation — son texte et ses pièces. Le
    /// message cité garde son propre verdict : une flamme, une flamme après
    /// lecture, une vue unique ou un message flouté ne sortent pas davantage
    /// dans la citation d'un message ordinaire que par eux-mêmes.
    ///
    /// - Le message cité RÉEL, quand l'appelant l'a en mémoire, est jugé par la
    ///   loi de sortie elle-même.
    /// - Sinon la citation répond de ce que le fil a déclaré
    ///   (`quotedExitNature`). FERMÉ PAR DÉFAUT : une nature non déclarée ne
    ///   prouve pas « ordinaire ».
    func quotedContentMayLeave(quotedMessage: MeeshyMessage?) -> Bool {
        guard !quotedMediaIsProtected, !isQuotedMessageDeleted else { return false }
        if let quotedMessage, quotedMessage.id == messageId {
            return quotedMessage.contentExitLaw.exportable
                && !quotedMessage.isBlurred
                && !quotedMessage.attachments.contains { $0.isBlurred }
        }
        return quotedExitNature == .ordinary
    }

    /// **La citation porte-t-elle un contenu PROTÉGÉ ?** (#9573, décision
    /// porteur du 2026-10-08)
    ///
    /// Citer un contenu protégé reste permis, et la contagion de protection des
    /// réponses s'applique ; mais « Imager » — et « Imager la discussion » qui
    /// contient la réponse — ne s'offre pas : la carte est la seule sortie qui
    /// peigne la citation. Protégé = ce que `quotedContentMayLeave` refuse
    /// (flamme, flamme après lecture, vue unique, flou, nature non déclarée),
    /// FERMÉ PAR DÉFAUT.
    ///
    /// Deux citations n'en relèvent pas : celle d'une story ou d'une humeur (elle
    /// ne cite pas un message), et celle d'un message SUPPRIMÉ, qui ne porte plus
    /// rien de lui. Une citation scellée parce que le cité ÉPHÉMÈRE a expiré
    /// (`isQuotedMessageExpired`) reste, elle, celle d'une flamme.
    func quotesProtectedContent(quotedMessage: MeeshyMessage?) -> Bool {
        guard !isStoryReply, moodEmoji == nil else { return false }
        if isQuotedMessageDeleted { return isQuotedMessageExpired }
        return !quotedContentMayLeave(quotedMessage: quotedMessage)
    }
}

public extension MeeshyMessage {
    /// Le message CITE-t-il un contenu protégé ? — jugé sur ce que la citation
    /// déclare (`ReplyReference.quotesProtectedContent`). Un message qui ne cite
    /// rien ne cite rien de protégé.
    var quotesProtectedContent: Bool {
        replyTo?.quotesProtectedContent(quotedMessage: nil) ?? false
    }
}
