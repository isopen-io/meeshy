import SwiftUI
import MeeshySDK

// MARK: - La commande de lecture

/// La commande de lecture d'un vocal (#18421), composée des atomes du kit : le
/// bouton rond de verre (K02) pour lire, mettre en pause ou télécharger ;
/// l'anneau (K09) pendant un téléchargement ou un chargement. La taille du
/// fichier reste dessous dans les états de transfert, comme la vignette d'une
/// vidéo (`DownloadBadgeView`).
///
/// L'haptique est jouée par l'hôte, qui connaît l'effet réel du toucher
/// (relais au coordinateur, lecture locale, téléchargement) : le bouton n'en
/// joue pas une seconde.
struct AudioPlayerPlayControl: View {
    let availability: AudioAvailability
    let isCompact: Bool
    let isDark: Bool
    let accent: Color
    let isPlaying: Bool
    let isLoading: Bool
    let fileSize: Int
    let onPlay: () -> Void
    let onDownload: (() -> Void)?

    private var size: MeeshyGlassButtonSize { isCompact ? .s36 : .s40 }
    private var tone: MeeshyGlassTone { isDark ? .deep : .onLight }

    var body: some View {
        VStack(spacing: MeeshySpacing.xxs) {
            disc
            sizeLabel
        }
    }

    @ViewBuilder
    private var disc: some View {
        switch availability {
        case .ready where isLoading:
            ring(progress: nil, label: String(localized: "media.audio.loading", defaultValue: "Chargement de l'audio", bundle: .module))
        case .ready:
            MeeshyGlassButton(
                systemImage: isPlaying ? "pause.fill" : "play.fill",
                label: isPlaying
                    ? String(localized: "media.audio.pause", defaultValue: "Mettre l'audio en pause", bundle: .module)
                    : String(localized: "media.audio.play", defaultValue: "Lire l'audio", bundle: .module),
                size: size,
                activation: .toggle(isPlaying),
                tone: tone,
                tint: accent,
                haptic: .none,
                action: onPlay
            )
        case .needsDownload:
            MeeshyGlassButton(
                systemImage: "arrow.down.to.line",
                label: String(localized: "media.audio.download", defaultValue: "Télécharger l'audio", bundle: .module),
                size: size,
                tone: tone,
                tint: accent,
                haptic: .none,
                action: { onDownload?() }
            )
        case .downloading(let progress, _, _):
            ring(
                progress: progress > 0 ? progress : nil,
                label: String(localized: "media.audio.downloading", defaultValue: "Téléchargement de l'audio", bundle: .module)
            )
        }
    }

    private func ring(progress: Double?, label: String) -> some View {
        MeeshyProgressRing(
            progress: progress, label: label, diameter: CGFloat(size.diameter),
            tint: .solid(accent), showsPercent: false, tone: tone
        ) { EmptyView() }
    }

    /// Le libellé de taille, dans les seuls états de transfert : prêt, la bulle
    /// porte déjà sa durée sur l'onde.
    @ViewBuilder
    private var sizeLabel: some View {
        switch availability {
        case .ready:
            EmptyView()
        case .needsDownload:
            transferLabel(AudioPlayerView.formattedNeedsDownloadLabel(fileSize: fileSize))
        case .downloading(_, let downloaded, let total):
            transferLabel(AudioPlayerView.formattedDownloadingLabel(
                downloadedBytes: downloaded, totalBytes: total, fallbackFileSize: fileSize
            ))
        }
    }

    @ViewBuilder
    private func transferLabel(_ label: String) -> some View {
        if !label.isEmpty {
            Text(label)
                .meeshyScaledFont(MeeshyFont.microSize, weight: .semibold, design: .monospaced)
                .foregroundColor(isDark ? .white.opacity(0.65) : .black.opacity(0.55))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
    }
}
