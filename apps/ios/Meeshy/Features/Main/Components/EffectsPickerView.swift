import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - EffectChip

struct EffectChip: View {
    let flag: MessageEffectFlags
    let icon: String
    let label: String
    let accentColor: String
    @Binding var flags: MessageEffectFlags

    private var isSelected: Bool { flags.contains(flag) }

    var body: some View {
        Button {
            HapticFeedback.light()
            if isSelected { flags.remove(flag) } else { flags.insert(flag) }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(MeeshyFont.relative(13))
                Text(label)
                    .font(MeeshyFont.relative(12, weight: .medium))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(isSelected ? Color(hex: accentColor).opacity(0.2) : Color.gray.opacity(0.1))
            .foregroundColor(isSelected ? Color(hex: accentColor) : .secondary)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(isSelected ? Color(hex: accentColor).opacity(0.5) : Color.clear, lineWidth: 1)
            )
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isSelected)
        .accessibilityLabel("\(label), \(isSelected ? String(localized: "effects.active", defaultValue: "actif", bundle: .main) : String(localized: "effects.inactive", defaultValue: "inactif", bundle: .main))")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

// MARK: - EffectsPickerView

struct EffectsPickerView: View {
    @Binding var effects: MessageEffects
    let accentColor: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(String(localized: "effects.title", defaultValue: "Effets du message", bundle: .main))
                    .font(MeeshyFont.relative(17, weight: .bold))
                Spacer()
                Button(String(localized: "common.ok", defaultValue: "OK", bundle: .main)) { dismiss() }
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
            }
            .padding(.horizontal)
            .padding(.top, 16)

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    effectSection(title: String(localized: "effects.section.behavior", defaultValue: "Comportement", bundle: .main), items: [
                        (.ephemeral, "hourglass", String(localized: "effects.ephemeral", defaultValue: "\u{00C9}ph\u{00E9}m\u{00E8}re", bundle: .main)),
                        (.blurred, "eye.slash", String(localized: "effects.blurred", defaultValue: "Flou", bundle: .main)),
                        (.viewOnce, "1.circle", String(localized: "effects.view-once", defaultValue: "Vue unique", bundle: .main)),
                    ])

                    effectSection(title: String(localized: "effects.section.entry", defaultValue: "Animation d'entr\u{00E9}e", bundle: .main), items: [
                        (.shake, "waveform", String(localized: "effects.shake", defaultValue: "Secousse", bundle: .main)),
                        (.zoom, "arrow.up.left.and.arrow.down.right", String(localized: "effects.zoom", defaultValue: "Zoom", bundle: .main)),
                        (.explode, "rays", String(localized: "effects.explode", defaultValue: "Explosion", bundle: .main)),
                        (.confetti, "party.popper", String(localized: "effects.confetti", defaultValue: "Confetti", bundle: .main)),
                        (.fireworks, "sparkles", String(localized: "effects.fireworks", defaultValue: "Feux d'artifice", bundle: .main)),
                        (.waoo, "star.fill", String(localized: "effects.waoo", defaultValue: "Waoo", bundle: .main)),
                    ])

                    effectSection(title: String(localized: "effects.section.permanent", defaultValue: "Effet permanent", bundle: .main), items: [
                        (.glow, "sun.max", String(localized: "effects.glow", defaultValue: "Lueur", bundle: .main)),
                        (.pulse, "heart.fill", String(localized: "effects.pulse", defaultValue: "Pulsation", bundle: .main)),
                        (.rainbow, "rainbow", String(localized: "effects.rainbow", defaultValue: "Arc-en-ciel", bundle: .main)),
                        (.sparkle, "sparkle", String(localized: "effects.sparkle", defaultValue: "Scintillant", bundle: .main)),
                    ])

                    if effects.flags.contains(.ephemeral) {
                        ephemeralDurationPicker
                    }

                    if effects.hasAnyEffect {
                        activeEffectsSummary
                    }
                }
                .padding(.bottom, 16)
            }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Effect Section

    @ViewBuilder
    private func effectSection(title: String, items: [(MessageEffectFlags, String, String)]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundColor(.secondary)
                .padding(.horizontal)
                .accessibilityAddTraits(.isHeader)

            FlowLayout(spacing: 8) {
                ForEach(items, id: \.2) { flag, icon, label in
                    EffectChip(flag: flag, icon: icon, label: label, accentColor: accentColor, flags: $effects.flags)
                }
            }
            .padding(.horizontal)
        }
    }

    // MARK: - Ephemeral Duration Picker

    private var ephemeralDurationPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "effects.ephemeral-duration", defaultValue: "Dur\u{00E9}e \u{00E9}ph\u{00E9}m\u{00E8}re", bundle: .main))
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundColor(.secondary)
            HStack(spacing: 8) {
                ForEach(EphemeralDuration.allCases) { duration in
                    Button {
                        HapticFeedback.light()
                        effects.ephemeralDuration = duration.rawValue
                    } label: {
                        Text(duration.label)
                            .font(MeeshyFont.relative(12, weight: .medium))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(effects.ephemeralDuration == duration.rawValue
                                        ? Color(hex: accentColor).opacity(0.2)
                                        : Color.gray.opacity(0.1))
                            .foregroundColor(effects.ephemeralDuration == duration.rawValue
                                             ? Color(hex: accentColor)
                                             : .secondary)
                            .clipShape(Capsule())
                    }
                    .accessibilityLabel(String(format: String(localized: "effects.duration-a11y", defaultValue: "Dur\u{00E9}e %@", bundle: .main), duration.label))
                    .accessibilityAddTraits(effects.ephemeralDuration == duration.rawValue ? .isSelected : [])
                }
            }
        }
        .padding(.horizontal)
        .transition(.opacity.combined(with: .move(edge: .top)))
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: effects.flags.contains(.ephemeral))
    }

    // MARK: - Active Effects Summary

    private var activeEffectsSummary: some View {
        HStack {
            Text(String(format: String(localized: "effects.active-count", defaultValue: "%d effet(s) actif(s)", bundle: .main), effects.flags.rawValue.nonzeroBitCount))
                .font(MeeshyFont.relative(12))
                .foregroundColor(.secondary)
            Spacer()
            Button(String(localized: "effects.clear-all", defaultValue: "Tout effacer", bundle: .main)) {
                HapticFeedback.light()
                effects = .none
            }
            .font(MeeshyFont.relative(12, weight: .medium))
            .foregroundColor(MeeshyColors.error.opacity(0.8))
        }
        .padding(.horizontal)
        .transition(.opacity)
    }
}

