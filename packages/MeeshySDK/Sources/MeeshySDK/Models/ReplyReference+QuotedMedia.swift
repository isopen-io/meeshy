import Foundation

// MARK: - La pièce citée, reconstruite depuis les FAITS de la citation (#8230)

public extension ReplyReference {

    /// Le GENRE du média cité, décodé depuis ses deux formes : le MIME brut
    /// (« video/mp4 », gravé par le cache et les faits) ou le rawValue court
    /// (« video », posé par la bulle optimiste et l'instantané `attachmentReplyTo`).
    /// Le MIME des faits l'emporte : c'est le plus précis des deux.
    var quotedMediaKind: AttachmentKind? {
        AttachmentKind(quotedType: attachmentMimeType ?? attachmentType)
    }

    /// La pièce jointe que cette citation décrit, reconstruite depuis ce
    /// qu'elle porte — pour ouvrir en PLEIN ÉCRAN une pièce dont le message
    /// n'est pas dans la fenêtre chargée, et pour extraire le poster d'une
    /// vidéo dont la vignette serveur a raté.
    ///
    /// `nil` dès qu'il n'y a rien d'HONNÊTE à ouvrir :
    /// - une story ou une humeur (leur plein écran est le viewer, zone 3) ;
    /// - un média PROTÉGÉ — son adresse ne voyage pas, et une pièce protégée
    ///   reconstruite se présenterait comme ordinaire ;
    /// - une pièce sans adresse de fichier ;
    /// - ce qui n'est ni image, ni vidéo, ni audio.
    ///
    /// Son identifiant est l'ANCRE de la citation quand elle en porte une,
    /// sinon un identifiant dérivé du message cité — stable, pour que deux
    /// ouvertures de la même citation désignent la même pièce.
    var quotedAttachment: MeeshyMessageAttachment? {
        guard !isStoryReply, !quotedMediaIsProtected,
              let fileUrl = attachmentFileUrl, !fileUrl.isEmpty,
              let kind = quotedMediaKind, let mime = resolvedMimeType(for: kind)
        else { return nil }
        return MeeshyMessageAttachment(
            id: attachmentId ?? "quoted-\(messageId)",
            messageId: messageId.isEmpty ? nil : messageId,
            mimeType: mime,
            fileSize: attachmentFileSize ?? 0,
            fileUrl: fileUrl,
            width: attachmentWidth,
            height: attachmentHeight,
            thumbnailUrl: attachmentThumbnailUrl,
            thumbHash: attachmentThumbHash,
            duration: attachmentDurationMs,
            pageCount: attachmentPageCount
        )
    }

    /// Le MIME exact quand les faits le portent, sinon un MIME générique du
    /// genre — assez pour que `MeeshyMessageAttachment.type` route la pièce.
    private func resolvedMimeType(for kind: AttachmentKind) -> String? {
        if let exact = attachmentMimeType, AttachmentKind(mimeType: exact) == kind { return exact }
        return Self.genericMimeType(for: kind)
    }

    private static func genericMimeType(for kind: AttachmentKind) -> String? {
        switch kind {
        case .image: return "image/jpeg"
        case .video: return "video/mp4"
        case .audio: return "audio/mp4"
        default: return nil
        }
    }
}

// MARK: - Le décodeur des DEUX formes d'un genre cité

public extension AttachmentKind {
    /// Le genre d'un média cité, depuis le rawValue court (« video ») ou le
    /// MIME brut (« video/mp4 ») — les deux formes qu'`attachmentType` porte
    /// selon qu'il vient de la bulle optimiste ou du cache. `nil` seulement
    /// sans valeur ; un type inconnu rend `.other`. Site UNIQUE : la citation
    /// côté app (`BubbleQuotedReply.resolveAttachmentKind`) le délègue ici.
    init?(quotedType: String?) {
        guard let quotedType, !quotedType.isEmpty else { return nil }
        self = AttachmentKind(rawValue: quotedType) ?? AttachmentKind(mimeType: quotedType)
    }
}
