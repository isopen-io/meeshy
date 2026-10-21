import SwiftUI
import MeeshySDK
import MeeshyUI

struct PreviewAudioPlayer: View {
    let track: ServedAudioTrack
    let contactColor: String

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @StateObject private var player = OverlayAudioPlayer()

    private var accent: Color { Color(hex: contactColor) }

    var body: some View {
        VStack(spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.smPlus) {
                Button { player.toggle(url: track.url) } label: {
                    ZStack {
                        Circle()
                            .fill(accent.opacity(0.2))
                            .frame(width: 40, height: 40)
                        if player.isLoading {
                            ProgressView()
                                .tint(accent)
                                .scaleEffect(0.6)
                        } else {
                            // Glyph inside a fixed 40×40 circle — kept fixed to
                            // stay centred; the Button carries the a11y label.
                            Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                                .font(.system(size: MeeshyIconSize.md, weight: .semibold))
                                .foregroundColor(accent)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(player.isPlaying
                    ? String(localized: "media.pauseAudio", defaultValue: "Mettre en pause", bundle: .main)
                    : String(localized: "media.playAudio", defaultValue: "Lire l'audio", bundle: .main))
                .accessibilityHint(String(format: String(localized: "media.audioHint", defaultValue: "Audio de %@", bundle: .main), player.spokenTotalDuration(attachmentDurationMs: track.durationMs)))

                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    // Comme la bulle : aucun nom de fichier, qui trahirait l'original (#9010).
                    Text(MediaKindLabel.voiceMessage())
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    Text(player.timeLabel(attachmentDurationMs: track.durationMs))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .monospacedDigit()
                }

                Spacer()

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
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .foregroundColor(accent)
                        .padding(.horizontal, MeeshySpacing.sm)
                        .padding(.vertical, MeeshySpacing.xs)
                        .background(Capsule().fill(accent.opacity(0.12)))
                }
            }

            if let transcript = track.transcript, !transcript.isEmpty {
                Text(transcript)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            HStack(spacing: MeeshySpacing.sm) {
                Button { player.skip(seconds: -5) } label: {
                    Image(systemName: "gobackward.5")
                        .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "media.skipBack5s", defaultValue: "Reculer de 5 secondes", bundle: .main))

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

                // Pourcentage d'avancement
                Text(LocalizedNumber.percent(player.percentInt))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .heavy, design: .monospaced))
                    .foregroundColor(player.percentInt == 0 ? theme.textMuted : accent)
                    .frame(minWidth: 36)
                    .contentTransition(.numericText())
                    .animation(.easeInOut(duration: 0.15), value: player.percentInt)
                    .accessibilityHidden(true)

                Button { player.skip(seconds: 5) } label: {
                    Image(systemName: "goforward.5")
                        .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "media.skipForward5s", defaultValue: "Avancer de 5 secondes", bundle: .main))
            }
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.smPlus)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
        )
        .onDisappear { player.stop() }
    }
}
