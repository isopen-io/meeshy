import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Preview Video Player (interactive)
//
// Extrait de `MessageOverlayMenu.swift` (#9043) : l'hôte frôlait le plafond de
// 1200 lignes et devait recevoir le glissement qui réduit l'aperçu. Un lecteur
// média n'a rien à faire dans le fichier d'un menu contextuel — même raison
// que `OverlayAudioPlayer` (#7005).

struct PreviewVideoPlayer: View {
    let attachment: MessageAttachment
    let contactColor: String

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @StateObject private var player = OverlayAudioPlayer()
    @State private var showThumbnail = true

    private var accent: Color { Color(hex: contactColor) }

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                let thumbUrl = attachment.thumbnailUrl?.isEmpty == false ? attachment.thumbnailUrl : nil
                let fullUrl = attachment.fileUrl.isEmpty ? nil : attachment.fileUrl
                ProgressiveCachedImage(
                    thumbHash: attachment.thumbHash,
                    thumbnailUrl: thumbUrl,
                    fullUrl: fullUrl ?? thumbUrl
                ) {
                    Color(hex: contactColor).opacity(0.2)
                }
                // #8009 — le rapport d'aspect ORIGINAL de la vidéo, ni rognée ni étirée.
                .aspectRatio(OverlayPreviewMediaLayout.aspectRatio(of: attachment), contentMode: .fit)
                .frame(maxWidth: .infinity, maxHeight: 320)
                .clipped()

                if showThumbnail {
                    Button {
                        showThumbnail = false
                        player.toggle(url: attachment.fileUrl)
                    } label: {
                        Circle()
                            .fill(.black.opacity(0.5))
                            .frame(width: 52, height: 52)
                            .overlay(
                                // Glyph inside a fixed 52×52 play circle — kept
                                // fixed; the Button carries the a11y label.
                                Image(systemName: "play.fill")
                                    .font(.system(size: MeeshyIconSize.xl))
                                    .foregroundColor(.white)
                                    .offset(x: 2)
                            )
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(String(localized: "media.playVideo", defaultValue: "Lire la vidéo", bundle: .main))
                }
            }
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: 14, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 14))

            if !showThumbnail {
                videoControls
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
        .onDisappear { player.stop() }
    }

    private var videoControls: some View {
        VStack(spacing: MeeshySpacing.xs) {
            Slider(
                value: Binding(
                    get: { player.progress },
                    set: { player.seek(to: $0) }
                ),
                in: 0...1
            )
            .tint(accent)
            .accessibilityLabel(String(localized: "media.playbackPosition", defaultValue: "Position de lecture", bundle: .main))
            .accessibilityValue(LocalizedNumber.percent(player.percentInt))

            HStack(spacing: MeeshySpacing.sm) {
                Button { player.toggle(url: attachment.fileUrl) } label: {
                    if player.isLoading {
                        ProgressView()
                            .tint(accent)
                            .scaleEffect(0.5)
                            .frame(width: 14, height: 14)
                    } else {
                        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                            .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .semibold))
                            .foregroundColor(accent)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(player.isPlaying
                    ? String(localized: "media.pauseVideo", defaultValue: "Mettre la vidéo en pause", bundle: .main)
                    : String(localized: "media.playVideo", defaultValue: "Lire la vidéo", bundle: .main))

                Button { player.skip(seconds: -5) } label: {
                    Image(systemName: "gobackward.5")
                        .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "media.skipBack5s", defaultValue: "Reculer de 5 secondes", bundle: .main))

                Text(LocalizedNumber.percent(player.percentInt))
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .heavy, design: .monospaced))
                    .foregroundColor(player.percentInt == 0 ? theme.textMuted : accent)
                    .frame(minWidth: 32)
                    .contentTransition(.numericText())
                    .animation(.easeInOut(duration: 0.15), value: player.percentInt)
                    .accessibilityHidden(true)

                Button { player.skip(seconds: 5) } label: {
                    Image(systemName: "goforward.5")
                        .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "media.skipForward5s", defaultValue: "Avancer de 5 secondes", bundle: .main))

                Spacer()

                Text(player.timeLabel(attachmentDurationMs: attachment.duration))
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .monospacedDigit()

                speedMenu
            }
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.sm)
        .background(
            UnevenRoundedRectangle(topLeadingRadius: 0, bottomLeadingRadius: 14, bottomTrailingRadius: 14, topTrailingRadius: 0)
                .fill(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
        )
    }

    private var speedMenu: some View {
        Menu {
            ForEach([0.5, 0.75, 1.0, 1.25, 1.5, 2.0], id: \.self) { rate in
                Button {
                    player.setRate(Float(rate))
                } label: {
                    HStack {
                        Text(rate == 1.0 ? "Normal" : "\(String(format: "%.2g", rate))x")
                        if abs(Double(player.playbackRate) - rate) < 0.01 {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            Text("\(String(format: "%.2g", player.playbackRate))x")
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                .foregroundColor(accent)
                .padding(.horizontal, 6)
                .padding(.vertical, MeeshySpacing.xxs)
                .background(Capsule().fill(accent.opacity(0.12)))
        }
    }
}
