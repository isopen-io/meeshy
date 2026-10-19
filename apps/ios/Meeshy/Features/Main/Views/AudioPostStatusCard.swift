import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Status Card (transcription / préview)

/// Carte d'état hors capture : la phase idle/recording est entièrement
/// portée par la feuille unifiée (`AudioRecorderSheet`).
struct AudioPostStatusCard: View {
    let phase: AudioPostComposerView.ComposerPhase
    let borrowedSound: APISound?
    let isDark: Bool
    let formattedDuration: String
    let spokenDuration: String

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(spacing: MeeshySpacing.lg) {
            ZStack {
                Circle()
                    .fill(haloColor.opacity(MeeshyOpacity.light))
                    .frame(width: 168, height: 168)
                    .blur(radius: 4)

                Circle()
                    .fill(haloColor.opacity(MeeshyOpacity.subtle))
                    .frame(width: 132, height: 132)

                centerContent
                    // Visualisation d'état purement décorative (sceau / note /
                    // spinner). L'état parlé est porté par `durationLabel` juste
                    // en dessous → on masque le décor pour éviter le bruit
                    // VoiceOver.
                    .accessibilityHidden(true)
            }
            .frame(height: 132)

            durationLabel
        }
        .padding(.vertical, MeeshySpacing.xxl)
        .padding(.horizontal, MeeshySpacing.xl)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.xxl)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.xxl)
                        .stroke(MeeshyColors.indigo300.opacity(isDark ? 0.25 : 0.4), lineWidth: 1)
                )
        )
    }

    @ViewBuilder
    private var centerContent: some View {
        if phase == .transcribing {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: MeeshyColors.indigo500))
                .scaleEffect(1.6)
        } else if borrowedSound != nil {
            Image(systemName: "music.note.list")
                .font(MeeshyFont.relative(56))
                .foregroundStyle(MeeshyColors.brandGradient)
        } else {
            Image(systemName: "checkmark.seal.fill")
                .font(MeeshyFont.relative(56))
                .foregroundStyle(
                    LinearGradient(
                        colors: [MeeshyColors.success, MeeshyColors.success.opacity(MeeshyOpacity.heavy)],
                        startPoint: .top, endPoint: .bottom
                    )
                )
        }
    }

    private var haloColor: Color {
        if phase == .preview { return borrowedSound != nil ? MeeshyColors.indigo500 : MeeshyColors.success }
        return MeeshyColors.indigo500
    }

    @ViewBuilder
    private var durationLabel: some View {
        if phase == .preview, let borrowedSound {
            VStack(spacing: MeeshySpacing.xs) {
                Text(borrowedSound.hasAuthoredTitle
                     ? borrowedSound.title
                     : String(localized: "media.sound.original", defaultValue: "Son original"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                Text(borrowedSound.authorLabel.map { "@\($0)" } ?? "")
                    .font(.caption)
                    .foregroundColor(theme.textSecondary)
                Text(formattedDuration)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundColor(theme.textMuted)
            }
        } else if phase == .preview {
            Text(formattedDuration)
                .font(.system(.largeTitle, design: .monospaced).weight(.light))
                .foregroundColor(theme.textPrimary)
                // A bare monospaced "0:34" reads to VoiceOver as a context-less
                // number. Name what the timer measures via the label and expose
                // the running time as the value.
                .accessibilityLabel(String(localized: "composer.audio.recorded-duration", defaultValue: "Durée enregistrée"))
                .accessibilityValue(spokenDuration)
        } else if phase == .transcribing {
            VStack(spacing: MeeshySpacing.xs) {
                Text(String(localized: "composer.audio.transcription.running", defaultValue: "Transcription en cours…"))
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(theme.textSecondary)
                Text(formattedDuration)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundColor(theme.textMuted)
            }
        }
    }
}
