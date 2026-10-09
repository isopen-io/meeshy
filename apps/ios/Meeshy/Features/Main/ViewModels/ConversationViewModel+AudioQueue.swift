import Foundation
import MeeshySDK

// MARK: - La file des vocaux d'une conversation

/// Ce que la conversation confie au lecteur partagé (`ConversationAudioCoordinator`) :
/// la piste EFFECTIVE de chaque vocal (bascule du drapeau, puis Prisme), sa
/// langue et sa protection — que le mini-lecteur, Now Playing et l'îlot
/// dynamique (#9783) lisent tous depuis la même entrée de file.
extension ConversationViewModel {

    /// Kicks off conversation-wide audio playback starting at `attachmentId`.
    ///
    /// Resolves the message/attachment in the current `messages` snapshot,
    /// asks `AudioQueueBuilder` for the unlistened, non-self tail of audios
    /// strictly after this one, then routes the whole queue through the app
    /// coordinator (which gates on CallKit + auth and exposes the mini-player
    /// state to the rest of the app).
    func playAudio(attachmentId: String) {
        guard let (message, attachment) = findAudioAttachment(id: attachmentId),
              attachment.type == .audio,
              authManager.currentUser?.id != nil else { return }

        audioCoordinator.play(
            current: queuedAudio(for: attachment, message: message),
            tail: audioQueueTail(after: attachment.id),
            conversationName: currentConversationName,
            conversationArtworkURL: currentConversationArtworkURL
        )
    }

    /// File des vocaux non écoutés strictement APRÈS `attachmentId` — partagée
    /// entre `playAudio` et le plein écran (`AudioFullscreenSource.queueTailProvider`).
    func audioQueueTail(after attachmentId: String) -> [QueuedAudio] {
        guard let currentUserId = authManager.currentUser?.id else { return [] }
        return AudioQueueBuilder.build(
            from: messages,
            startingAfterAttachmentId: attachmentId,
            currentUserId: currentUserId,
            listenedAttachmentIds: listenedAttachmentIds,
            // L'auto-avance joue la piste EFFECTIVE de chaque vocal — sans
            // ce résolveur, le 2e vocal sortait en V.O. pendant que sa bulle
            // affichait le karaoké traduit (revue adversariale 2026-08-18).
            trackUrlResolver: { [weak self] message, attachment in
                self?.effectiveAudioTrackUrl(for: attachment, message: message) ?? attachment.fileUrl
            }
        )
        .map { queued in
            guard let (message, attachment) = findAudioAttachment(id: queued.attachmentId) else { return queued }
            return queuedAudio(for: attachment, message: message)
        }
    }

    /// L'entrée de file d'un vocal : la piste SERVIE (URL et langue partent
    /// ENSEMBLE — la langue est celle du texte servi, jamais une seconde
    /// descente) et la protection du message.
    func queuedAudio(for attachment: MessageAttachment, message: Message) -> QueuedAudio {
        let served = servedAudioTrack(for: attachment, message: message)
        return QueuedAudio(
            attachmentId: attachment.id,
            messageId: message.id,
            conversationId: message.conversationId,
            fileUrl: served.url,
            durationMs: attachment.duration ?? 0,
            senderName: message.senderName ?? "",
            senderAvatarURL: message.senderAvatarURL,
            receivedAt: message.createdAt,
            trackLanguage: served.language ?? message.originalLanguage,
            isTranslatedTrack: served.language != nil,
            isProtected: Self.isProtectedVoice(message)
        )
    }

    /// Éphémère, vue unique, flouté ou chiffré.
    static func isProtectedVoice(_ message: Message) -> Bool {
        message.isViewOnce || message.isBlurred || message.expiresAt != nil || message.isEncrypted
    }
}
