import Foundation
import MeeshySDK

/// La pièce citée prête à jouer — jamais un audio protégé, supprimé, expiré ou à vue unique.
enum QuotedAudioResolver {

    /// Le message cité est en mémoire : la piste suit le Prisme audio de CE vocal (`effectiveUrl`).
    static func inWindow(
        _ reference: ReplyReference, quoted: Message, now: Date,
        effectiveUrl: (MessageAttachment, Message) -> String
    ) -> QueuedAudio? {
        guard !quoted.isDeleted, !quoted.isViewOnce, !quoted.isBlurred, !quoted.isEncrypted else { return nil }
        if let expiresAt = quoted.expiresAt, expiresAt <= now { return nil }
        guard let attachment = reference.citedAttachment(among: quoted.attachments),
              attachment.type == .audio, !attachment.isViewOnce, !attachment.isBlurred,
              !attachment.fileUrl.isEmpty
        else { return nil }
        return QueuedAudio(
            attachmentId: attachment.id,
            messageId: quoted.id,
            conversationId: quoted.conversationId,
            fileUrl: effectiveUrl(attachment, quoted),
            durationMs: attachment.duration ?? 0,
            senderName: quoted.senderName ?? reference.authorName,
            senderAvatarURL: quoted.senderAvatarURL ?? reference.authorAvatarUrl,
            receivedAt: quoted.createdAt
        )
    }

    /// Hors de la fenêtre chargée : la piste est celle que la citation porte, élue par le prisme du lecteur.
    static func outOfWindow(
        _ reference: ReplyReference, conversationId: String, readerLanguages: [String]
    ) -> QueuedAudio? {
        guard let attachment = reference.quotedAttachment, attachment.type == .audio else { return nil }
        let tracks = reference.quotedAudioTracks
        let language = AudioTrackLanguageResolver.resolve(
            originalLanguage: tracks?.originalLanguage ?? "",
            preferredLanguages: readerLanguages,
            availableLanguages: Array((tracks?.urlsByLanguage ?? [:]).keys)
        )
        guard let url = reference.quotedAudioUrl(forLanguage: language) else { return nil }
        return QueuedAudio(
            attachmentId: attachment.id,
            messageId: reference.messageId,
            conversationId: conversationId,
            fileUrl: url,
            durationMs: attachment.duration ?? 0,
            senderName: reference.authorName,
            senderAvatarURL: reference.authorAvatarUrl,
            receivedAt: Date()
        )
    }
}
