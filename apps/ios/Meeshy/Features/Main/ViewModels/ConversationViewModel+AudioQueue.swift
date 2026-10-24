import Foundation
import Combine
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
            trackLanguage: served.language ?? trackOriginLanguage(for: attachment, message: message),
            isTranslatedTrack: served.language != nil,
            isProtected: Self.isProtectedVoice(message)
        )
    }

    /// La transcription ORIGINALE d'un vocal : par pièce jointe d'abord, repli par message filtré.
    func originalTranscription(for attachment: MessageAttachment, messageId: String) -> MessageTranscription? {
        messageTranscriptionsByAttachment[attachment.id]
            ?? messageTranscriptions[messageId].flatMap { $0.attachmentId == attachment.id ? $0 : nil }
    }

    /// #10691 — la langue d'origine de CETTE piste (sa transcription, repli : le message),
    /// la même que le widget lit (`AudioMediaView.trackOriginLanguage`) : la piste jouée et
    /// le texte affiché descendent le Prisme depuis le même point.
    func trackOriginLanguage(for attachment: MessageAttachment, message: Message) -> String {
        AudioTrackLanguageResolver.originLanguage(
            transcriptionLanguage: originalTranscription(for: attachment, messageId: message.id)?.language
                ?? attachment.transcription?.language,
            messageOriginal: message.originalLanguage
        )
    }

    /// Éphémère, vue unique, flouté ou chiffré.
    static func isProtectedVoice(_ message: Message) -> Bool {
        message.isViewOnce || message.isBlurred || message.expiresAt != nil || message.isEncrypted
    }

    /// O(n) scan over `messages` for the message that owns `attachmentId`.
    /// `messages` rarely exceeds a few hundred rows in memory; an index would
    /// have to invalidate on every attachment update for negligible gain.
    func findAudioAttachment(id: String) -> (Message, MessageAttachment)? {
        for message in messages {
            if let att = message.attachments.first(where: { $0.id == id && $0.type == .audio }) {
                return (message, att)
            }
        }
        return nil
    }

    /// Pistes traduites d'un attachement — MÊME source que `allAudioItems`
    /// (par-attachement d'abord, repli par-message filtré), jamais une
    /// troisième résolution.
    private func translatedAudioTracks(for attachment: MessageAttachment, messageId: String) -> [MessageTranslatedAudio] {
        startupDependencies.encryptedEra.servedTranslatedAudios(of: attachment, messageId: messageId, in: self)
    }

    /// URL de la piste audio EFFECTIVE d'un attachement — la même loi que le
    /// widget (`AudioTrackLanguageResolver` : bascule manuelle du drapeau
    /// puis Prisme). C'est CETTE url que le coordinateur doit jouer pour que
    /// l'audio entendu corresponde au texte et aux segments affichés.
    func effectiveAudioTrackUrl(for attachment: MessageAttachment, message: Message) -> String {
        servedAudioTrack(for: attachment, message: message).url
    }

    /// La piste SERVIE entière (URL, durée, texte) — la descente de
    /// `effectiveAudioTrackUrl`, que l'aperçu d'appui long reçoit (#9010).
    func servedAudioTrack(for attachment: MessageAttachment, message: Message) -> ServedAudioTrack {
        let transcript = originalTranscription(for: attachment, messageId: message.id)
        return AudioTrackLanguageResolver.servedTrack(
            of: attachment,
            manualOverride: bubbleLanguageSelections[message.id]?.activeDisplayLangCode,
            originalLanguage: trackOriginLanguage(for: attachment, message: message),
            preferredLanguages: ConversationLanguagePreferences(user: authManager.currentUser).resolved,
            translatedAudios: translatedAudioTracks(for: attachment, messageId: message.id),
            originalTranscript: transcript?.text ?? attachment.transcription?.text
        )
    }

    func servedAudioTracks(of message: Message) -> [String: ServedAudioTrack] {
        Dictionary(message.attachments.filter { $0.type == .audio }.map { ($0.id, servedAudioTrack(for: $0, message: message)) },
                   uniquingKeysWith: { first, _ in first })
    }

    func subscribeToMessagesForAudioQueue() {
        audioQueueFeed.followMessages(of: self, publishing: $messages.eraseToAnyPublisher())
            .store(in: &cancellables)
    }

    func subscribeToAudioCoordinatorFinishedEvents() {
        audioQueueFeed.followFinishedEvents(of: self).store(in: &cancellables)
    }

    var audioQueueUserId: String? { authManager.currentUser?.id }
}

extension ConversationViewModel: ConversationAudioQueueHosting {}

/// La mémoire des messages déjà vus par la file des vocaux : seuls les
/// INSERTIONS nouvelles d'un autre auteur, dans la conversation jouée,
/// rejoignent la file.
struct AudioQueueAppendTracker {
    private var seenMessageIds: Set<String> = []
    private var didSeedSnapshot = false

    mutating func newAudios(
        in snapshot: [Message],
        activeConversationId: String?,
        conversationId: String,
        currentUserId: String?,
        listenedAttachmentIds: Set<String>
    ) -> [(Message, MessageAttachment)] {
        // First emission (and any emission while no coordinator session is
        // active for THIS conversation) just refreshes the baseline so the
        // backlog never replays as "new" once playback starts.
        guard didSeedSnapshot,
              let activeConvId = activeConversationId,
              activeConvId == conversationId,
              let currentUserId else {
            seenMessageIds = Set(snapshot.map(\.id))
            didSeedSnapshot = true
            return []
        }

        var arrivals: [(Message, MessageAttachment)] = []
        for message in snapshot where !seenMessageIds.contains(message.id) {
            seenMessageIds.insert(message.id)
            guard message.senderId != currentUserId,
                  message.conversationId == activeConvId else { continue }
            for attachment in message.attachments
                where attachment.type == .audio
                && !listenedAttachmentIds.contains(attachment.id) {
                arrivals.append((message, attachment))
            }
        }
        return arrivals
    }
}
