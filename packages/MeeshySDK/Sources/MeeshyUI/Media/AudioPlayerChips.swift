import SwiftUI
import MeeshySDK

// MARK: - Speed Chip

/// La puce de vitesse, à droite de l'onde. Le pourcentage d'avancement qui
/// vivait sous elle est parti sur la forme d'onde, au bord de fin
/// (`AudioWaveformChipsOverlay`, #18421), avec l'affordance plein écran.
struct AudioPlayerSpeedChip: View {
    let speed: PlaybackSpeed
    let isCompact: Bool
    let isDark: Bool
    let accent: Color
    let onCycleSpeed: () -> Void

    var body: some View {
        let isDefault = speed == .x1_0
        let chipBg: Color = isDefault
            ? (isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))
            : accent.opacity(0.85)
        let chipFg: Color = isDefault
            ? (isDark ? .white.opacity(0.55) : .black.opacity(0.45))
            : .white
        return Button {
            onCycleSpeed()
            HapticFeedback.light()
        } label: {
            Text(speed.label)
                .meeshyScaledFont(isCompact ? 9 : 10, weight: .bold, design: .monospaced)
                .foregroundStyle(chipFg)
                .padding(.horizontal, isCompact ? 7 : 8)
                .padding(.vertical, isCompact ? 2 : 3)
                .background(Capsule().fill(chipBg))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "media.audio.speed.cycle",
                                   defaultValue: "Vitesse de lecture \(speed.label)",
                                   bundle: .module))
    }
}

// MARK: - Language Selector

/// Bandeau de pastilles de langue audio (original + pistes traduites).
/// `onSelect` porte l'effet complet d'un tap (bascule, relais externe,
/// haptique) — le propriétaire reste seul maître de l'état de langue.
struct AudioLanguageStrip: View {
    let translatedAudios: [MessageTranslatedAudio]
    let selectedAudioLanguage: String
    let isDark: Bool
    let accent: Color
    let onSelect: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.xsPlus) {
                audioLanguagePill(flag: "\u{1F50A}", code: "orig", label: String(localized: "media.audio.original", defaultValue: "Original", bundle: .module),
                                  isSelected: selectedAudioLanguage == "orig")

                ForEach(translatedAudios, id: \.id) { audio in
                    let lang = DetectedLanguage.find(code: audio.targetLanguage)
                    audioLanguagePill(
                        flag: lang?.flag ?? "\u{1F310}",
                        code: audio.targetLanguage,
                        label: lang?.name ?? audio.targetLanguage,
                        isSelected: selectedAudioLanguage.lowercased() == audio.targetLanguage.lowercased()
                    )
                }
            }
            .padding(.horizontal, MeeshySpacing.sm)
        }
    }

    private func audioLanguagePill(flag: String, code: String, label: String, isSelected: Bool) -> some View {
        Button {
            onSelect(code)
        } label: {
            HStack(spacing: MeeshySpacing.xxs) {
                Text(flag).font(.system(size: MeeshyFont.smallSize))
                Text(label).font(.system(size: MeeshyFont.captionSize, weight: isSelected ? .bold : .medium))
            }
            .foregroundColor(isSelected ? .white : (isDark ? .white.opacity(0.55) : .black.opacity(0.45)))
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.xs)
            .background(Capsule().fill(isSelected ? accent : (isDark ? Color.white.opacity(0.07) : Color.black.opacity(0.04))))
        }
    }
}
