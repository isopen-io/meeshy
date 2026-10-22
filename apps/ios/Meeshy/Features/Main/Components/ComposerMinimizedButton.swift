import SwiftUI
import MeeshyUI

/// Le composeur REPLIÉ : deux boutons flottants, « Vocal » et « Écrire », qui
/// déplient la barre. Sorti de `UniversalComposerBar` (cohésion, #10988) : il
/// ne lit que des valeurs et rend ses deux gestes à la barre.
struct ComposerMinimizedButton: View {
    let showsVoice: Bool
    let isDark: Bool
    let mutedColor: Color
    let accent: Color
    let secondary: Color
    let onVoice: () -> Void
    let onWrite: () -> Void

    private var captionColor: Color { isDark ? .white.opacity(0.5) : mutedColor }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            if showsVoice {
                Button {
                    HapticFeedback.medium()
                    onVoice()
                } label: {
                    VStack(spacing: MeeshySpacing.xxs) {
                        voiceDisc
                        caption(String(localized: "composer.minimized.voice", defaultValue: "Vocal", bundle: .main))
                    }
                }
            }

            Button {
                HapticFeedback.medium()
                onWrite()
            } label: {
                VStack(spacing: MeeshySpacing.xxs) {
                    writeDisc
                    caption(String(localized: "composer.minimized.write", defaultValue: "Écrire", bundle: .main))
                }
            }
        }
        .padding(.trailing, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.md)
        .frame(maxWidth: .infinity, alignment: .trailing)
    }

    private var voiceGradient: LinearGradient {
        LinearGradient(colors: [MeeshyColors.error, MeeshyColors.errorDark],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    private var voiceDisc: some View {
        ZStack {
            Circle()
                .fill(.ultraThinMaterial)
                .frame(width: 44, height: 44)
                .overlay(
                    Circle().stroke(
                        LinearGradient(
                            colors: [MeeshyColors.error.opacity(0.5), MeeshyColors.errorDark.opacity(0.3)],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        ), lineWidth: 1
                    )
                )
                .shadow(color: MeeshyColors.error.opacity(0.2), radius: 6, y: 2)

            Image(systemName: "mic.fill")
                .font(.body.weight(.medium))
                .foregroundStyle(voiceGradient)
        }
    }

    private var writeDisc: some View {
        ZStack {
            Circle()
                .fill(LinearGradient(colors: [accent, secondary], startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 50, height: 50)
                .shadow(color: accent.opacity(0.4), radius: 8, y: 3)

            Image(systemName: "square.and.pencil")
                .font(.title3.weight(.semibold))
                .foregroundColor(.white)
        }
    }

    private func caption(_ text: String) -> some View {
        Text(text)
            .font(.caption2).fontWeight(.semibold)
            .foregroundColor(captionColor)
    }
}
