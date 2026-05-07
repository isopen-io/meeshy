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

    var body: some View {
        switch attachment.type {
        case .image:
            ImageViewerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: accentHex
            )

        case .video:
            VideoPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: accentHex
            )

        case .audio:
            AudioPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: accentHex,
                transcription: transcription,
                translatedAudios: translatedAudios.filter { $0.attachmentId == attachment.id }
            )

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
                    .frame(width: 200, height: 120)
                    .overlay(
                        VStack(spacing: 8) {
                            Image(systemName: "mappin.circle.fill")
                                .font(.system(size: 36))
                                .foregroundColor(.white)

                            Text("Position partagee")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.white.opacity(0.9))
                        }
                    )
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Position partagee")
            }
        }
    }
}
