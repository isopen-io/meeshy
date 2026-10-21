import SwiftUI
import MeeshySDK

// MARK: - Right Chips Column (speed + progress, stacked vertically)

/// Colonne droite du widget audio : chip vitesse en haut (alignée avec la
/// waveform), chip pourcentage juste en dessous (alignée avec timeRow).
/// Le tap sur la chip pourcentage ouvre la vue plein écran — le pourcentage
/// qui n'était qu'un libellé devient l'affordance.
struct AudioPlayerChipsColumn: View {
    let speed: PlaybackSpeed
    let progressFraction: Double
    let isCompact: Bool
    let isDark: Bool
    let accent: Color
    let onCycleSpeed: () -> Void
    let onFullscreen: (() -> Void)?

    var body: some View {
        VStack(alignment: .trailing, spacing: isCompact ? 3 : 4) {
            speedChip
            percentageChip
        }
    }

    private var speedChip: some View {
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
                .font(.system(size: isCompact ? 9 : 10, weight: .bold, design: .monospaced))
                .foregroundColor(chipFg)
                .padding(.horizontal, isCompact ? 7 : 8)
                .padding(.vertical, isCompact ? 2 : 3)
                .background(Capsule().fill(chipBg))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "media.audio.speed.cycle",
                                   defaultValue: "Vitesse de lecture \(speed.label)",
                                   bundle: .module))
    }

    private var percentageChip: some View {
        let pct = Int(progressFraction * 100)
        let isStarted = pct > 0
        let chipBg: Color = isStarted
            ? accent.opacity(0.85)
            : (isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))
        let chipFg: Color = isStarted
            ? .white
            : (isDark ? .white.opacity(0.55) : .black.opacity(0.45))
        let label = Text("\(pct)%")
            .font(.system(size: isCompact ? 9 : 10, weight: .heavy, design: .monospaced))
            .foregroundColor(chipFg)
            .padding(.horizontal, isCompact ? 7 : 8)
            .padding(.vertical, isCompact ? 2 : 3)
            .background(Capsule().fill(chipBg))
            .contentTransition(.numericText())
            .animation(.easeInOut(duration: 0.15), value: pct)

        return Group {
            if let onFullscreen = onFullscreen {
                Button {
                    HapticFeedback.light()
                    onFullscreen()
                } label: { label }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "media.audio.open.fullscreen",
                                           defaultValue: "Ouvrir en plein écran, lecture \(pct)%",
                                           bundle: .module))
                .accessibilityHint(String(localized: "media.audio.open.fullscreen.hint",
                                          defaultValue: "Affiche la vue plein écran avec les options de sauvegarde",
                                          bundle: .module))
            } else {
                label
            }
        }
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
