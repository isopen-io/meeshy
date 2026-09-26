import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - EffectChip

struct EffectChip: View {
    let flag: MessageEffectFlags
    let icon: String
    let label: String
    let accent: Color
    @Binding var flags: MessageEffectFlags

    private var isSelected: Bool { flags.contains(flag) }

    var body: some View {
        Button {
            HapticFeedback.light()
            if isSelected { flags.remove(flag) } else { flags.insert(flag) }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.caption2)
                Text(label)
                    .font(.caption).fontWeight(.semibold)
            }
            .foregroundColor(isSelected ? .white : accent)
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(isSelected ? accent : accent.opacity(0.1))
                    .overlay(Capsule().stroke(accent.opacity(0.3), lineWidth: 0.5))
            )
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isSelected)
        .accessibilityLabel("\(label), \(isSelected ? String(localized: "effects.active", defaultValue: "actif", bundle: .main) : String(localized: "effects.inactive", defaultValue: "inactif", bundle: .main))")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

// MARK: - EffectsPickerView

/// **Les effets du message, en petit panneau au-dessus de la barre d'outils**
/// (#7967, directive porteur 2026-09-25 : « la feuille des effets doit suivre
/// la même logique que le petit menu des messages éphémères »).
///
/// Même forme que le rail de la durée éphémère : un fond arrondi dans le verre
/// du composeur, des capsules qu'un tap arme ou désarme. Deux rangées — ce qui
/// joue à l'ARRIVÉE du message, ce qui l'habille EN PERMANENCE. Le
/// comportement (éphémère, flou, vue unique) n'y figure pas : la barre
/// d'outils le porte déjà, et deux boutons pour un même réglage se
/// contrediraient.
struct EffectsPickerView: View {
    @Binding var flags: MessageEffectFlags
    let accent: Color
    let muted: Color
    let surface: Color

    typealias Item = (flag: MessageEffectFlags, icon: String, label: String)

    static let entryItems: [Item] = [
        (.shake, "waveform", String(localized: "effects.shake", defaultValue: "Secousse", bundle: .main)),
        (.zoom, "arrow.up.left.and.arrow.down.right", String(localized: "effects.zoom", defaultValue: "Zoom", bundle: .main)),
        (.explode, "rays", String(localized: "effects.explode", defaultValue: "Explosion", bundle: .main)),
        (.confetti, "party.popper", String(localized: "effects.confetti", defaultValue: "Confettis", bundle: .main)),
        (.fireworks, "sparkles", String(localized: "effects.fireworks", defaultValue: "Feux d'artifice", bundle: .main)),
        (.waoo, "star.fill", String(localized: "effects.waoo", defaultValue: "Waouh", bundle: .main)),
    ]

    static let permanentItems: [Item] = [
        (.glow, "sun.max", String(localized: "effects.glow", defaultValue: "Lueur", bundle: .main)),
        (.pulse, "heart.fill", String(localized: "effects.pulse", defaultValue: "Pulsation", bundle: .main)),
        (.rainbow, "rainbow", String(localized: "effects.rainbow", defaultValue: "Arc-en-ciel", bundle: .main)),
        (.sparkle, "sparkle", String(localized: "effects.sparkle", defaultValue: "Scintillant", bundle: .main)),
    ]

    /// Ce que le panneau arme — et donc ce que « Tout effacer » retire, sans
    /// toucher aux protections que la barre d'outils règle.
    static let panelFlags: MessageEffectFlags = (entryItems + permanentItems)
        .reduce(into: MessageEffectFlags()) { $0.insert($1.flag) }

    private var hasPanelEffect: Bool { !flags.intersection(Self.panelFlags).isEmpty }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                sectionTitle(String(localized: "effects.section.entry", defaultValue: "Animation d'entrée", bundle: .main))
                Spacer()
                if hasPanelEffect {
                    Button {
                        HapticFeedback.light()
                        flags.subtract(Self.panelFlags)
                    } label: {
                        Text(String(localized: "effects.clear-all", defaultValue: "Tout effacer", bundle: .main))
                            .font(.caption2).fontWeight(.semibold)
                            .foregroundColor(MeeshyColors.error.opacity(0.8))
                    }
                    .transition(.opacity)
                }
            }
            .padding(.horizontal, 12)

            chipRow(Self.entryItems)

            sectionTitle(String(localized: "effects.section.permanent", defaultValue: "Effet permanent", bundle: .main))
                .padding(.horizontal, 12)
                .padding(.top, 2)

            chipRow(Self.permanentItems)
        }
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(surface)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(accent.opacity(0.2), lineWidth: 0.5)
                )
        )
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: hasPanelEffect)
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(.caption2).fontWeight(.semibold)
            .foregroundColor(muted)
            .accessibilityAddTraits(.isHeader)
    }

    private func chipRow(_ items: [Item]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items, id: \.label) { item in
                    EffectChip(flag: item.flag, icon: item.icon, label: item.label, accent: accent, flags: $flags)
                }
            }
            .padding(.horizontal, 12)
        }
    }
}
