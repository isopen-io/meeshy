import SwiftUI
import MeeshySDK

// MARK: - Play Button Label

struct AudioPlayerPlayButtonLabel: View {
    let availability: AudioAvailability
    let isCompact: Bool
    let isDark: Bool
    let accent: Color
    let isPlaying: Bool
    let isLoading: Bool
    let fileSize: Int

    var body: some View {
        let size: CGFloat = isCompact ? 34 : 40
        VStack(spacing: MeeshySpacing.xxs) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [accent, accent.opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: size, height: size)
                    .shadow(color: accent.opacity(0.3), radius: 6, y: 2)

                switch availability {
                case .ready:
                    if isLoading {
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(0.6)
                    } else {
                        Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: isCompact ? 13 : 15, weight: .bold))
                            .foregroundStyle(.white)
                            .offset(x: isPlaying ? 0 : 1)
                    }
                case .needsDownload:
                    Image(systemName: "arrow.down.to.line")
                        .font(.system(size: isCompact ? 13 : 15, weight: .bold))
                        .foregroundStyle(.white)
                case .downloading(let progress, _, _):
                    if progress > 0 {
                        Circle()
                            .trim(from: 0, to: progress)
                            .stroke(Color.white, style: StrokeStyle(lineWidth: MeeshyBorder.strong, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                            .frame(width: size * 0.5, height: size * 0.5)
                            .animation(.linear(duration: 0.2), value: progress)
                    } else {
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(0.6)
                    }
                }
            }

            // Label de taille — affiché uniquement dans les états transfert.
            // .ready ne montre rien (le bubble a déjà sa durée à droite du
            // scrubber). Parité visuelle avec DownloadBadgeView pour les
            // bubbles vidéo/image.
            switch availability {
            case .ready:
                EmptyView()
            case .needsDownload:
                let label = AudioPlayerView.formattedNeedsDownloadLabel(fileSize: fileSize)
                if !label.isEmpty {
                    Text(label)
                        .meeshyScaledFont(MeeshyFont.microSize, weight: .semibold, design: .monospaced)
                        .foregroundColor(isDark ? .white.opacity(0.65) : .black.opacity(0.55))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
            case .downloading(_, let downloaded, let total):
                let label = AudioPlayerView.formattedDownloadingLabel(
                    downloadedBytes: downloaded,
                    totalBytes: total,
                    fallbackFileSize: fileSize
                )
                if !label.isEmpty {
                    Text(label)
                        .meeshyScaledFont(MeeshyFont.microSize, weight: .semibold, design: .monospaced)
                        .foregroundColor(isDark ? .white.opacity(0.65) : .black.opacity(0.55))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
            }
        }
    }
}
