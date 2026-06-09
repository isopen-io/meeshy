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
            if let lat = attachment.latitude, let lon = attachment.longitude {
                LocationMessageView(
                    latitude: lat,
                    longitude: lon,
                    placeName: attachment.originalName.isEmpty ? nil : attachment.originalName,
                    address: nil,
                    accentColor: accentHex,
                    onTapFullscreen: {
                        onTapLocation?(attachment)
                    }
                )
            } else {
                RoundedRectangle(cornerRadius: 12)
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: attachment.thumbnailColor), Color(hex: attachment.thumbnailColor).opacity(0.6)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(maxWidth: .infinity).aspectRatio(5/3, contentMode: .fit)
                    .overlay(
                        VStack(spacing: 8) {
                            Image(systemName: "mappin.circle.fill")
                                .font(.system(.largeTitle))
                                .foregroundColor(.white)

                            Text(String(localized: "bubble.attachment.locationShared", defaultValue: "Position partagee", bundle: .main))
                                .font(.caption.weight(.medium))
                                .foregroundColor(.white.opacity(0.9))
                        }
                    )
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(String(localized: "bubble.attachment.locationShared", defaultValue: "Position partagee", bundle: .main))
            }
        }
    }
}
