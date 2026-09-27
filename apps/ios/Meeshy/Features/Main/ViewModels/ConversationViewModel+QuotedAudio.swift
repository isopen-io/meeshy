import Foundation
import MeeshySDK

// MARK: - La zone LECTURE d'une citation audio (#8320)

/// Directive porteur du 2026-09-27 : dans une réponse, toucher la zone
/// lecture de la citation d'un audio JOUE l'audio cité sur place ; un second
/// toucher le met en pause. Le reste de la citation ramène au message
/// (`MessageListViewController.scrollToMessage`, inchangé).
///
/// AUCUN SECOND LECTEUR : la lecture passe par le coordinateur PARTAGÉ
/// (`ConversationAudioCoordinator`) — lire une citation arrête l'audio en
/// cours, comme partout. La file ne porte que la pièce citée : une citation
/// n'enchaîne pas sur les vocaux qui suivent l'original.
///
/// LA PISTE suit le Prisme audio du vocal d'origine :
/// - message cité EN MÉMOIRE → `effectiveAudioTrackUrl`, la loi du widget
///   (bascule manuelle du drapeau, puis Prisme) ;
/// - HORS de la fenêtre → les pistes que la citation porte
///   (`ReplyReference.quotedAudioTracks`), départagées par
///   `AudioTrackLanguageResolver` sur le même prisme.
///
/// Un audio PROTÉGÉ (vue unique, flouté, chiffré), supprimé ou expiré ne
/// joue jamais : la citation le déclare (`offersQuotedAudioPlayback`) ET le
/// message réel relu en mémoire le confirme.
extension ConversationViewModel {

    /// La pièce citée prête à jouer, ou `nil` quand rien d'honnête ne l'est.
    func quotedAudioItem(for reference: ReplyReference, now: Date = Date()) -> QueuedAudio? {
        guard reference.offersQuotedAudioPlayback(now: now) else { return nil }
        if let quoted = messages.first(where: { $0.id == reference.messageId }) {
            return inWindowQuotedAudio(reference, quoted: quoted, now: now)
        }
        return outOfWindowQuotedAudio(reference)
    }

    /// Joue la citation, ou met en pause / reprend si c'est déjà elle qui joue.
    /// Rend `false` quand rien ne peut être joué — l'hôte retombe alors sur le
    /// saut au message d'origine.
    @discardableResult
    func toggleQuotedAudio(_ reference: ReplyReference, now: Date = Date()) -> Bool {
        guard let item = quotedAudioItem(for: reference, now: now) else { return false }
        if audioCoordinator.activeContext?.attachmentId == item.attachmentId {
            audioCoordinator.togglePlayPause()
            return true
        }
        audioCoordinator.play(
            current: item,
            tail: [],
            conversationName: currentConversationName,
            conversationArtworkURL: currentConversationArtworkURL
        )
        return true
    }

    private func inWindowQuotedAudio(_ reference: ReplyReference, quoted: Message, now: Date) -> QueuedAudio? {
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
            fileUrl: effectiveAudioTrackUrl(for: attachment, message: quoted),
            durationMs: attachment.duration ?? 0,
            senderName: quoted.senderName ?? reference.authorName,
            senderAvatarURL: quoted.senderAvatarURL ?? reference.authorAvatarUrl,
            receivedAt: quoted.createdAt
        )
    }

    private func outOfWindowQuotedAudio(_ reference: ReplyReference) -> QueuedAudio? {
        guard let attachment = reference.quotedAttachment, attachment.type == .audio else { return nil }
        let tracks = reference.quotedAudioTracks
        let language = AudioTrackLanguageResolver.resolve(
            originalLanguage: tracks?.originalLanguage ?? "",
            preferredLanguages: ConversationLanguagePreferences(user: authManager.currentUser).resolved,
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
