import SwiftUI
import MeeshySDK
import MeeshyUI

/// Rendu d'un attachment a l'interieur d'une bulle. Dispatch sur le type :
/// image, video, audio, file (code/document), location.
///
/// Was: ThemedMessageBubble.attachmentView(_:) (lignes 982-1060).
///
/// La sheet de partage de fichier et le fullscreen de localisation restent
/// possedes par la god view ; on remonte les actions via callbacks pour
/// ne pas dupliquer l'etat.
///
/// Pas d'Equatable : `MeeshyMessageAttachment` n'est pas Equatable cote SDK
/// et cette vue n'est pas une cellule de liste critique.
struct BubbleAttachmentView: View {
    let attachment: MessageAttachment
    let isMe: Bool
    let isDark: Bool
    let accentHex: String
    var transcription: MessageTranscription? = nil
    var translatedAudios: [MessageTranslatedAudio] = []
    var onShareFile: ((URL) -> Void)? = nil
    var onTapLocation: ((MessageAttachment) -> Void)? = nil
    /// Phase 5: forwarded to the audio router so taps route through
    /// `ConversationViewModel.playAudio(attachmentId:)`. Nil-default keeps
    /// non-audio attachment renders unchanged.
    var onPlayAudio: ((String) -> Void)? = nil

    var body: some View {
        switch attachment.type {
        case .image:
            ImageViewerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: accentHex
            )

        case .video:
            // Dead path in practice — videos route through visualMediaGrid in
            // BubbleStandardLayout. Keep a sound fallback that uses the
            // unified MeeshyVideoPlayer so we don't ship a UX regression
            // if a routing change ever lands a video in this branch.
            VideoAvailabilityResolver(attachment: attachment) { availability, onDownload in
                MeeshyVideoPlayer(
                    attachment: attachment,
                    style: .inline,
                    controls: .inlineDefault,
                    accentColor: accentHex,
                    frame: .bubble,
                    availability: availability,
                    performance: .inline,
                    onDownload: onDownload
                )
            }

        case .audio:
            // Cohérence avec case .video : on wrap dans un resolver qui
            // résout cache → policy → downloader. AudioMediaView (utilisé
            // par BubbleStandardLayout.mediaStandaloneView) garde sa propre
            // orchestration multi-langue ; ce chemin de fallback ne supporte
            // que le cas mono-langue (attachment.fileUrl), suffisant pour
            // les attachments audio mixés à un autre contenu de la bulle.
            // Phase 5: wrapped in `AudioBubbleRouter` so playback survives
            // scroll-off and routes through the shared coordinator engine
            // when this attachment is the active one.
            AudioAvailabilityResolver(attachment: attachment) { availability, onDownload in
                AudioBubbleRouter(
                    attachmentId: attachment.id,
                    attachment: attachment,
                    accentColorHex: accentHex,
                    transcription: transcription,
                    translatedAudios: translatedAudios.filter { $0.attachmentId == attachment.id },
                    onRequestTranscription: {
                        Task {
                            try? await AttachmentService.shared.requestTranscription(
                                attachmentId: attachment.id, force: false
                            )
                        }
                    },
                    onRetranscribe: {
                        Task {
                            try? await AttachmentService.shared.requestTranscription(
                                attachmentId: attachment.id, force: true
                            )
                        }
                    },
                    availability: availability,
                    onDownload: onDownload,
                    onPlayRequest: { onPlayAudio?(attachment.id) }
                )
            }

        case .file:
            if let lang = CodeLanguage.detect(fileName: attachment.originalName, mimeType: attachment.mimeType) {
                CodeViewerView(
                    attachment: attachment,
                    language: lang,
                    context: .messageBubble,
                    accentColor: accentHex
                )
            } else {
                DocumentViewerView(
                    attachment: attachment,
                    context: .messageBubble,
                    accentColor: accentHex
                )
            }

        case .location:
            // Rendu unique (Task 14, 2026-07-29) : `SharedPlace` reste le
            // véhicule même ici, alors que `MessageAttachment` ne porte que
            // lat/lon + originalName (pas d'adresse — même limite que
            // CommentMediaView/FeedView, cf. leurs commentaires `SharedPlace`).
            // Le fallback textuel sans coordonnées a été retiré : une fois la
            // position validée et hissée par le gateway (Task 7/8), un message
            // de type `.location` porte toujours lat/lon, ce cas devenait
            // inatteignable.
            if let lat = attachment.latitude, let lon = attachment.longitude {
                LocationMessageView(
                    place: SharedPlace(
                        latitude: lat,
                        longitude: lon,
                        name: attachment.originalName.isEmpty ? nil : attachment.originalName
                    ),
                    accentColor: accentHex,
                    onTapFullscreen: {
                        onTapLocation?(attachment)
                    }
                )
            }
        }
    }
}
