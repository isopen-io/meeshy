import Foundation

// MARK: - Ce que le plan de partage lit d'un message (#10947)

public extension MeeshyMessageAttachment {

    /// La pièce telle que le plan la lit : sa famille, son poids, sa durée et
    /// SES drapeaux de protection (ceux de `contentExitPiece`).
    var shareMedia: ShareMedia {
        ShareMedia(
            id: id,
            mimeType: mimeType,
            bytes: fileSize > 0 ? fileSize : nil,
            durationMs: duration,
            isViewOnce: isViewOnce,
            isBlurred: isBlurred,
            effectFlags: effectFlags
        )
    }
}

public extension MeeshyMessage {

    /// Le message tel que le plan le lit — les drapeaux de la loi de sortie
    /// (`contentExitSubject`), le chiffrement du message, de ses pièces OU de
    /// sa conversation, la citation d'un contenu protégé, et ses pièces hors lieu.
    func shareMessage(conversationIsEncrypted: Bool = false) -> ShareMessage {
        let subject = contentExitSubject
        return ShareMessage(
            id: id,
            text: content.isEmpty ? nil : content,
            isViewOnce: subject.isViewOnce,
            isBlurred: subject.isBlurred,
            effectFlags: subject.effectFlags,
            ephemeralDuration: subject.ephemeralDuration,
            expiresAt: subject.expiresAt,
            encrypted: conversationIsEncrypted || isEncrypted || attachments.contains { $0.isEncrypted },
            citesProtected: quotesProtectedContent,
            pieces: attachments.filter { $0.type != .location }.map(\.shareMedia)
        )
    }
}
