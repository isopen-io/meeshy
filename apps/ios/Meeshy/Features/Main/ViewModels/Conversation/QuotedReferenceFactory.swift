import Foundation
import MeeshySDK
import MeeshyUI

/// La citation OPTIMISTE d'un message EN MÉMOIRE — la seule que la bulle optimiste et la bannière
/// du composeur aient le droit de composer (#4945). Elle porte tout ce que l'écho serveur portera
/// (`APIMessageReplyTo.toReplyReference`), depuis ce que le client tient déjà, pour que la citation
/// ne « saute » pas à l'accusé.
enum QuotedReferenceFactory {

    /// - `named` : la pièce que le lecteur REGARDE (#6165). Elle l'emporte sur le représentatif ; une
    ///   pièce qui n'appartient pas au message cité retombe sur le représentatif, jamais sur un emprunt.
    /// - `servedText` : le texte que la BULLE du cité rend en ce moment (traduction élue par le Prisme,
    ///   bascule manuelle comprise, `nil` ⇒ l'original, jamais `translations.first`). Jamais appelé pour
    ///   un message protégé : une réponse ne republie pas le secret le temps que le serveur accuse.
    static func reference(
        quoting quoted: Message,
        citing named: MessageAttachment?,
        servedText: () -> String?
    ) -> ReplyReference {
        let representative = named
            .flatMap { piece in quoted.attachments.first { $0.id == piece.id } }
            ?? quoted.attachments.quotedRepresentative
        let messageIsProtected = quoted.isViewOnce || quoted.isBlurred || quoted.isEncrypted
        let representativeIsProtected = representative.map { $0.declaresViewOnce || $0.declaresBlur } ?? false
        let mediaMayTravel = !messageIsProtected && !representativeIsProtected
        var reference = ReplyReference(
            messageId: quoted.id,
            authorName: quoted.senderName ?? String(localized: "common.unknown_user", defaultValue: "Utilisateur", bundle: .main),
            previewText: messageIsProtected
                ? protectedPlaceholder(for: quoted, representative: representative)
                : previewText(for: quoted, representative: representative, servedText: servedText),
            isMe: quoted.isMe,
            authorColor: quoted.senderColor,
            authorAvatarUrl: quoted.senderAvatarURL,
            attachmentType: representative?.type.rawValue,
            attachmentId: representative?.id,
            attachmentThumbnailUrl: mediaMayTravel ? thumbnailUrl(of: representative) : nil,
            attachmentFileUrl: mediaMayTravel ? representative.flatMap { $0.fileUrl.isEmpty ? nil : $0.fileUrl } : nil,
            attachmentIsProtected: messageIsProtected ? true : representative.map { $0.declaresViewOnce || $0.declaresBlur },
            attachmentFacts: representative.map { facts(of: $0, mediaMayTravel: mediaMayTravel) }
        )
        reference.quotedExitNature = quoted.contentExitLaw.nature
        reference.authorIsAnonymous = quoted.senderIsAnonymous || !quoted.senderHasAccount
        if named == nil, !messageIsProtected {
            let tiles = quoted.attachments.filter { $0.type == .image || $0.type == .video }
            reference.quotedPieceCount = tiles.isEmpty ? nil : tiles.count
        }
        return reference
    }

    private static func previewText(
        for quoted: Message, representative: MessageAttachment?, servedText: () -> String?
    ) -> String {
        if !quoted.content.isEmpty {
            return servedText() ?? quoted.content
        }
        guard let first = representative else { return "" }
        if let contact = ContactCardFile.mediaLabel(
            mimeType: first.mimeType, fileName: first.originalName.isEmpty ? first.fileName : first.originalName
        ) {
            return contact
        }
        return MediaKindLabel.summary(MediaKindLabel.kind(for: first.type))
    }

    /// Une photo tout juste envoyée n'a pas encore de vignette serveur : la citation montre le fichier lui-même.
    private static func thumbnailUrl(of representative: MessageAttachment?) -> String? {
        representative?.thumbnailUrl ?? (representative?.type == .image ? representative?.fileUrl : nil)
    }

    /// Les sept faits, moins le ThumbHash quand le média ne peut pas voyager : le ThumbHash EST une image.
    private static func facts(of representative: MessageAttachment, mediaMayTravel: Bool) -> ReplyReference.QuotedAttachmentFacts {
        let facts = ReplyReference.QuotedAttachmentFacts(representative)
        guard !mediaMayTravel else { return facts }
        return ReplyReference.QuotedAttachmentFacts(
            thumbHash: nil,
            width: facts.width,
            height: facts.height,
            durationMs: facts.durationMs,
            fileSize: facts.fileSize,
            pageCount: facts.pageCount,
            mimeType: facts.mimeType
        )
    }

    /// Même vocabulaire et même précédence (vue unique, flouté, chiffré) que `APIMessageReplyTo.protectedPlaceholder`
    /// et `NotificationService.ts` : le texte ne change pas au moment de l'accusé.
    private static func protectedPlaceholder(for quoted: Message, representative: MessageAttachment?) -> String {
        let protectionIcon: String = {
            if quoted.isViewOnce { return "👁️" }
            if quoted.isBlurred { return "🌫️" }
            return "🔒"
        }()
        let contentTypeIcon: String = {
            switch representative?.type {
            case .image: return "🖼️"
            case .video: return "🎬"
            case .audio: return "🎵"
            case .location: return "📍"
            case .file: return "📎"
            case .none: return "💬"
            }
        }()
        return "\(protectionIcon) \(contentTypeIcon)"
    }
}
