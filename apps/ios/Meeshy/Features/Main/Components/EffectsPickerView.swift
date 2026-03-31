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
                    .font(.system(size: 13))
                Text(label)
                    .font(.system(size: 12, weight: .medium))
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
        .accessibilityLabel("\(label), \(isSelected ? "actif" : "inactif")")
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
                Text("Effets du message")
                    .font(.system(size: 17, weight: .bold))
                Spacer()
                Button("OK") { dismiss() }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
            }
            .padding(.horizontal)
            .padding(.top, 16)

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    effectSection(title: "Comportement", items: [
                        (.ephemeral, "hourglass", "\u{00C9}ph\u{00E9}m\u{00E8}re"),
                        (.blurred, "eye.slash", "Flou"),
                        (.viewOnce, "1.circle", "Vue unique"),
                    ])

                    effectSection(title: "Animation d'entr\u{00E9}e", items: [
                        (.shake, "waveform", "Secousse"),
                        (.zoom, "arrow.up.left.and.arrow.down.right", "Zoom"),
                        (.explode, "rays", "Explosion"),
                        (.confetti, "party.popper", "Confetti"),
                        (.fireworks, "sparkles", "Feux d'artifice"),
                        (.waoo, "star.fill", "Waoo"),
                    ])

                    effectSection(title: "Effet permanent", items: [
                        (.glow, "sun.max", "Lueur"),
                        (.pulse, "heart.fill", "Pulsation"),
                        (.rainbow, "rainbow", "Arc-en-ciel"),
                        (.sparkle, "sparkle", "Scintillant"),
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
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.secondary)
                .padding(.horizontal)

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
            Text("Dur\u{00E9}e \u{00E9}ph\u{00E9}m\u{00E8}re")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.secondary)
            HStack(spacing: 8) {
                ForEach(EphemeralDuration.allCases) { duration in
                    Button {
                        HapticFeedback.light()
                        effects.ephemeralDuration = duration.rawValue
                    } label: {
                        Text(duration.label)
                            .font(.system(size: 12, weight: .medium))
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
                    .accessibilityLabel("Dur\u{00E9}e \(duration.label)")
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
            Text("\(effects.flags.rawValue.nonzeroBitCount) effet(s) actif(s)")
                .font(.system(size: 12))
                .foregroundColor(.secondary)
            Spacer()
            Button("Tout effacer") {
                HapticFeedback.light()
                effects = .none
            }
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(.red.opacity(0.8))
        }
        .padding(.horizontal)
        .transition(.opacity)
    }
}

