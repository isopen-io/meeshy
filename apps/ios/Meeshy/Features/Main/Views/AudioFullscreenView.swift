import SwiftUI
import MeeshySDK
import MeeshyUI

struct AudioFullscreenView: View {
    let attachment: MessageAttachment
    let message: Message
    let contactColor: String
    var transcription: MessageTranscription? = nil
    var translatedAudios: [MessageTranslatedAudio] = []

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                // Top bar
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 28))
                            .foregroundColor(.white.opacity(0.8))
                    }
                    Spacer()
                }
                .padding()

                Spacer()

                // Author info
                VStack(spacing: 12) {
                    MeeshyAvatar(
                        name: message.senderName ?? "?",
                        mode: .custom(80),
                        accentColor: message.senderColor ?? contactColor,
                        avatarURL: message.senderAvatarURL
                    )
                    Text(message.senderName ?? "?")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                    Text(message.createdAt, format: .dateTime.day().month(.abbreviated).year().hour().minute())
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                    // Audio metadata
                    HStack(spacing: 12) {
                        if let dur = attachment.durationFormatted {
                            Label(dur, systemImage: "waveform")
                                .font(.system(size: 12, weight: .medium))
                        }
                        if attachment.fileSize > 0 {
                            Label(attachment.fileSizeFormatted, systemImage: "doc")
                                .font(.system(size: 12, weight: .medium))
                        }
                        if let codec = attachment.codec {
                            Text(codec.uppercased())
                                .font(.system(size: 11, weight: .bold, design: .monospaced))
                        }
                    }
                    .foregroundColor(.white.opacity(0.4))
                }
                .padding(.bottom, 32)

                // Audio player (fullscreen context)
                AudioPlayerView(
                    attachment: attachment,
                    context: .fullscreen,
                    accentColor: contactColor,
                    transcription: transcription,
                    translatedAudios: translatedAudios
                )
                .padding(.horizontal, 24)

                Spacer()
            }
        }
        .statusBar(hidden: true)
    }
}
