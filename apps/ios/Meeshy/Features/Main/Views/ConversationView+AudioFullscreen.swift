import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le plein écran AUDIO de la conversation (#8230)

/// **Un vocal cité s'ouvre en PLEIN ÉCRAN, comme une photo ou une vidéo citée.**
///
/// > « On devrait pouvoir lancer un audio ou vidéo en full screen à partir de
/// > la citation dans un message. » — directive porteur du 2026-09-27.
///
/// La zone média d'une citation d'audio lançait la lecture DANS le fil
/// (`playAudio`) ; le seul plein écran audio, `AudioFullscreenView`, n'était
/// présenté que par le `@State` local de la bulle audio elle-même. Il vit
/// désormais aussi au niveau de la conversation, sur le MÊME état que la
/// galerie (`galleryStartAttachment`) : une pièce audio l'ouvre, une image ou
/// une vidéo ouvre la galerie. Un seul état, donc un seul plein écran à la
/// fois — deux `fullScreenCover` du même hôte armés ensemble n'en montrent
/// aucun.
///
/// La liste est celle que la bulle audio ouvre (`allAudioItems`, tous les
/// vocaux de la fenêtre, balayables) ; une pièce citée HORS de la fenêtre —
/// reconstruite depuis les faits de la citation — s'ouvre seule, son auteur
/// relu dans la citation qui la désigne.
enum QuotedAudioFullscreen {

    /// Les pages du plein écran ouvert sur `start`.
    ///
    /// - `start` dans `items` ⇒ toutes les pistes de la fenêtre, pour que le
    ///   balayage continue sur les vocaux voisins ;
    /// - sinon ⇒ la seule pièce, sans transcription ni piste traduite (la
    ///   citation ne les transporte pas), l'auteur relu dans la citation que
    ///   porte l'un des messages de la fenêtre.
    static func sources(
        start: MessageAttachment,
        items: [ConversationViewModel.AudioItem],
        quotingMessages: [Message],
        conversationName: String?,
        queueTail: @escaping (String) -> [QueuedAudio]
    ) -> [AudioFullscreenSource] {
        let contextName = (conversationName?.isEmpty ?? true) ? nil : conversationName
        guard items.contains(where: { $0.id == start.id }) else {
            return [standalone(start, quotingMessages: quotingMessages, contextName: contextName)]
        }
        return items.map { item in
            let attachmentId = item.attachment.id
            return AudioFullscreenSource(
                from: item,
                nowPlayingContextName: contextName,
                queueTailProvider: { queueTail(attachmentId) }
            )
        }
    }

    private static func standalone(_ start: MessageAttachment,
                                   quotingMessages: [Message],
                                   contextName: String?) -> AudioFullscreenSource {
        let citation = quotingMessages.lazy
            .compactMap(\.replyTo)
            .first { $0.messageId == start.messageId && !$0.isStoryReply }
        let name = citation?.authorName ?? ""
        return AudioFullscreenSource(
            id: start.id,
            attachment: start,
            transcription: nil,
            translatedAudios: [],
            originalLanguage: "",
            caption: "",
            author: ProfileSheetUser(
                userId: nil,
                username: name,
                displayName: name.isEmpty ? nil : name,
                avatarURL: citation?.authorAvatarUrl,
                accentColor: citation?.authorColor ?? ""
            ),
            createdAt: start.createdAt,
            messageId: start.messageId,
            nowPlayingContextName: contextName
        )
    }
}

extension ConversationMediaGalleryLayer {

    /// Le plein écran audio ouvert par la zone média d'une citation.
    func audioFullscreen(start: MessageAttachment) -> some View {
        AudioFullscreenView(
            allAudioItems: QuotedAudioFullscreen.sources(
                start: start,
                items: viewModel.allAudioItems,
                quotingMessages: viewModel.messages,
                conversationName: viewModel.currentConversationName,
                queueTail: { id in viewModel.audioQueueTail(after: id) }
            ),
            startAttachmentId: start.id,
            contactColor: accentColor,
            mentionDisplayNames: viewModel.mentionDisplayNames
        )
    }
}
