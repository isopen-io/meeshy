import SwiftUI
import MeeshyUI
import AVFoundation
import Combine
import MeeshySDK

// MARK: - Extracted from UniversalComposerBar.swift

// ============================================================================
// MARK: - Bascules de protection & d'effets
// ============================================================================
//
// Découpage mécanique du fichier (#4104, budget 800–1100 lignes/fichier) —
// porte les bascules de protection (éphémère, flou, vue unique) et
// d'effets (effets ponctuels, effets permanents pour les commentaires).
// Fond aussi l'extension qui vivait en fin de fichier. Aucun changement de
// comportement, seulement un déplacement de lignes.

extension UniversalComposerBar {

    // ========================================================================
    // MARK: - Ephemeral Toggle Button
    // ========================================================================

    @ViewBuilder
    var ephemeralToggleButton: some View {
        let isActive = ephemeralDuration.wrappedValue != nil

        Button {
            onAnyInteraction?()
            HapticFeedback.light()
            if isActive {
                ephemeralDuration.wrappedValue = nil
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showEphemeralPicker = false
                }
            } else {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showEphemeralPicker.toggle()
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: isActive ? "flame.fill" : "timer.circle")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? MeeshyColors.error : mutedColor)

                if let duration = ephemeralDuration.wrappedValue {
                    Text(duration.label)
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(MeeshyColors.error)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isActive
                          ? MeeshyColors.error.opacity(0.15)
                          : Color.clear)
                    .overlay(
                        Capsule()
                            .stroke(isActive
                                    ? MeeshyColors.error.opacity(0.3)
                                    : Color.clear,
                                    lineWidth: 0.5)
                    )
            )
        }
        .accessibilityLabel(isActive
                            ? String(localized: "composer.ephemeral.active", defaultValue: "Mode ephemere actif: \(ephemeralDuration.wrappedValue?.displayLabel ?? "")", bundle: .main)
                            : String(localized: "composer.ephemeral.activate", defaultValue: "Activer le mode éphémère", bundle: .main))
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isActive)
    }

    // ========================================================================
    // MARK: - Ephemeral Duration Picker
    // ========================================================================

    var ephemeralDurationPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Button {
                    HapticFeedback.light()
                    ephemeralDuration.wrappedValue = nil
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showEphemeralPicker = false
                    }
                } label: {
                    Text(String(localized: "composer.ephemeral.off", defaultValue: "Off", bundle: .main))
                        .font(.caption).fontWeight(.semibold)
                        .foregroundColor(ephemeralDuration.wrappedValue == nil ? .white : mutedColor)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(ephemeralDuration.wrappedValue == nil
                                      ? Color(hex: accentColor)
                                      : style == .dark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
                        )
                }

                ForEach(EphemeralDuration.allCases) { duration in
                    Button {
                        HapticFeedback.light()
                        ephemeralDuration.wrappedValue = duration
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showEphemeralPicker = false
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "flame.fill")
                                .font(.caption2)
                            Text(duration.label)
                                .font(.caption).fontWeight(.semibold)
                        }
                        .foregroundColor(ephemeralDuration.wrappedValue == duration ? .white : MeeshyColors.error)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(ephemeralDuration.wrappedValue == duration
                                      ? MeeshyColors.error
                                      : MeeshyColors.error.opacity(0.1))
                                .overlay(
                                    Capsule()
                                        .stroke(MeeshyColors.error.opacity(0.3), lineWidth: 0.5)
                                )
                        )
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(style == .dark ? Color.black.opacity(0.3) : isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.9))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(MeeshyColors.error.opacity(0.2), lineWidth: 0.5)
                )
        )
        .padding(.horizontal, 8)
    }

    // ========================================================================
    // MARK: - Blur Toggle Button
    // ========================================================================

    @ViewBuilder
    var blurToggleButton: some View {
        let isActive = isBlurEnabled.wrappedValue

        Button {
            onAnyInteraction?()
            HapticFeedback.light()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                isBlurEnabled.wrappedValue.toggle()
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: isActive ? "eye.slash.fill" : "eye.slash")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? MeeshyColors.indigo600 : mutedColor)

                if isActive {
                    Text(String(localized: "composer.blur.label", defaultValue: "Flou", bundle: .main))
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(MeeshyColors.indigo600)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isActive
                          ? MeeshyColors.indigo600.opacity(0.15)
                          : Color.clear)
                    .overlay(
                        Capsule()
                            .stroke(isActive
                                    ? MeeshyColors.indigo600.opacity(0.3)
                                    : Color.clear,
                                    lineWidth: 0.5)
                    )
            )
        }
        .accessibilityLabel(isActive
                            ? String(localized: "composer.blur.active", defaultValue: "Mode flou actif", bundle: .main)
                            : String(localized: "composer.blur.activate", defaultValue: "Activer le mode flou", bundle: .main))
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isActive)
    }

    // ========================================================================
    // MARK: - View-Once Toggle Button
    // ========================================================================

    @ViewBuilder
    var viewOnceToggleButton: some View {
        let isActive = isViewOnceEnabled.wrappedValue

        Button {
            onAnyInteraction?()
            HapticFeedback.light()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                isViewOnceEnabled.wrappedValue.toggle()
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: isActive ? "1.circle.fill" : "1.circle")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? MeeshyColors.indigo600 : mutedColor)

                if isActive {
                    Text(String(localized: "composer.viewonce.label", defaultValue: "Vue unique", bundle: .main))
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(MeeshyColors.indigo600)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isActive
                          ? MeeshyColors.indigo600.opacity(0.15)
                          : Color.clear)
                    .overlay(
                        Capsule()
                            .stroke(isActive
                                    ? MeeshyColors.indigo600.opacity(0.3)
                                    : Color.clear,
                                    lineWidth: 0.5)
                    )
            )
        }
        .accessibilityLabel(isActive
                            ? String(localized: "composer.viewonce.active", defaultValue: "Mode vue unique actif", bundle: .main)
                            : String(localized: "composer.viewonce.activate", defaultValue: "Activer le mode vue unique", bundle: .main))
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isActive)
    }

// MARK: - Effects Toggle Button (extension)

    var effectsToggleButton: some View {
        let isActive = pendingEffects.wrappedValue.hasAnyEffect
        let effectCount = pendingEffects.wrappedValue.flags.rawValue.nonzeroBitCount

        return Button {
            onAnyInteraction?()
            HapticFeedback.light()
            onRequestEffectsPicker?()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: isActive ? "wand.and.stars" : "wand.and.stars")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? Color(hex: accentColor) : mutedColor)

                if isActive {
                    Text("\(effectCount)")
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(Color(hex: accentColor))
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isActive
                          ? Color(hex: accentColor).opacity(0.15)
                          : Color.clear)
                    .overlay(
                        Capsule()
                            .stroke(isActive
                                    ? Color(hex: accentColor).opacity(0.3)
                                    : Color.clear,
                                    lineWidth: 0.5)
                    )
            )
        }
        .accessibilityLabel(isActive
                            ? String(localized: "composer.effects.active", defaultValue: "\(effectCount) effet(s) actif(s)", bundle: .main)
                            : String(localized: "composer.effects.add", defaultValue: "Ajouter des effets au message", bundle: .main))
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isActive)
    }

    // ========================================================================
    // MARK: - Permanent Effects Toggle Button (comments)
    // ========================================================================

    var permanentEffectsToggleButton: some View {
        let persistentFlags: [MessageEffectFlags] = [.glow, .pulse, .rainbow, .sparkle]
        let activeCount = persistentFlags.filter { pendingEffects.wrappedValue.flags.contains($0) }.count
        let isActive = activeCount > 0

        return Button {
            onAnyInteraction?()
            HapticFeedback.light()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showPermanentEffectsPicker.toggle()
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: isActive ? "wand.and.stars" : "wand.and.stars")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? Color(hex: accentColor) : mutedColor)

                if isActive {
                    Text("\(activeCount)")
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(Color(hex: accentColor))
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isActive
                          ? Color(hex: accentColor).opacity(0.15)
                          : Color.clear)
                    .overlay(
                        Capsule()
                            .stroke(isActive
                                    ? Color(hex: accentColor).opacity(0.3)
                                    : Color.clear,
                                    lineWidth: 0.5)
                    )
            )
        }
        .accessibilityLabel(isActive
                            ? String(localized: "composer.effects.permanent.active", defaultValue: "\(activeCount) effet(s) permanent(s) actif(s)", bundle: .main)
                            : String(localized: "composer.effects.permanent.add", defaultValue: "Ajouter des effets permanents", bundle: .main))
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isActive)
    }

    // ========================================================================
    // MARK: - Permanent Effects Inline Picker (comments)
    // ========================================================================

    var permanentEffectsInlinePicker: some View {
        let items: [(flag: MessageEffectFlags, icon: String, label: String)] = [
            (.glow, "sun.max", String(localized: "composer.effects.glow", defaultValue: "Lueur", bundle: .main)),
            (.pulse, "heart.fill", String(localized: "composer.effects.pulse", defaultValue: "Pulsation", bundle: .main)),
            (.rainbow, "rainbow", String(localized: "composer.effects.rainbow", defaultValue: "Arc-en-ciel", bundle: .main)),
            (.sparkle, "sparkle", String(localized: "composer.effects.sparkle", defaultValue: "Scintillant", bundle: .main)),
        ]

        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items, id: \.label) { item in
                    let isSelected = pendingEffects.wrappedValue.flags.contains(item.flag)
                    Button {
                        HapticFeedback.light()
                        if isSelected {
                            pendingEffects.wrappedValue.flags.remove(item.flag)
                        } else {
                            pendingEffects.wrappedValue.flags.insert(item.flag)
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: item.icon)
                                .font(.caption2)
                            Text(item.label)
                                .font(.caption).fontWeight(.semibold)
                        }
                        .foregroundColor(isSelected ? .white : Color(hex: accentColor))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(isSelected
                                      ? Color(hex: accentColor)
                                      : Color(hex: accentColor).opacity(0.1))
                                .overlay(
                                    Capsule()
                                        .stroke(Color(hex: accentColor).opacity(0.3), lineWidth: 0.5)
                                )
                        )
                    }
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isSelected)
                    .accessibilityLabel(String(localized: "composer.effects.item.state", defaultValue: "\(item.label), \(isSelected ? String(localized: "common.active", defaultValue: "actif", bundle: .main) : String(localized: "common.inactive", defaultValue: "inactif", bundle: .main))", bundle: .main))
                    .accessibilityAddTraits(isSelected ? .isSelected : [])
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(style == .dark ? Color.black.opacity(0.3) : isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.9))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color(hex: accentColor).opacity(0.2), lineWidth: 0.5)
                )
        )
        .padding(.horizontal, 8)
    }
}
