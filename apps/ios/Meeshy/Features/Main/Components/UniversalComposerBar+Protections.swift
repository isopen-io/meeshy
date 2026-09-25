import SwiftUI
import MeeshySDK
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
                    showEffectsPanel = false
                    showEphemeralPicker.toggle()
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: isActive ? MessageProtectionSymbols.ephemeralFilled : MessageProtectionSymbols.ephemeral)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? ComposerProtection.ephemeral.tint : mutedColor)

                if let duration = ephemeralDuration.wrappedValue {
                    Text(duration.label)
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(ComposerProtection.ephemeral.tint)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isActive
                          ? ComposerProtection.ephemeral.tint.opacity(0.15)
                          : Color.clear)
                    .overlay(
                        Capsule()
                            .stroke(isActive
                                    ? ComposerProtection.ephemeral.tint.opacity(0.3)
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
                    Text(String(localized: "composer.ephemeral.off", defaultValue: "Désactivé", bundle: .main))
                        .font(.caption).fontWeight(.semibold)
                        .foregroundColor(ephemeralDuration.wrappedValue == nil ? .white : mutedColor)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(ephemeralDuration.wrappedValue == nil
                                      ? servedAccent
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
                            Image(systemName: MessageProtectionSymbols.ephemeralFilled)
                                .font(.caption2)
                            Text(duration.label)
                                .font(.caption).fontWeight(.semibold)
                        }
                        .foregroundColor(ephemeralDuration.wrappedValue == duration ? .white : ComposerProtection.ephemeral.tint)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(ephemeralDuration.wrappedValue == duration
                                      ? ComposerProtection.ephemeral.tint
                                      : ComposerProtection.ephemeral.tint.opacity(0.1))
                                .overlay(
                                    Capsule()
                                        .stroke(ComposerProtection.ephemeral.tint.opacity(0.3), lineWidth: 0.5)
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
                .fill(railSurface)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(ComposerProtection.ephemeral.tint.opacity(0.2), lineWidth: 0.5)
                )
        )
        .padding(.horizontal, 8)
    }

    /// Le rail qui s'ouvre au-dessus de la barre d'outils garde cette marge
    /// avec le bord HAUT du verre (#7966).
    static let railTopInset: CGFloat = 8

    /// Le fond commun des rails du composeur — durée éphémère, effets.
    var railSurface: Color {
        style == .dark || isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.9)
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
            toggleVeil(.blurred)
        } label: {
            HStack(spacing: 4) {
                Image(systemName: isActive ? MessageProtectionSymbols.blurredFilled : MessageProtectionSymbols.blurred)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? ComposerProtection.blurred.tint : mutedColor)

                if isActive {
                    Text(String(localized: "composer.blur.label", defaultValue: "Flou", bundle: .main))
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(ComposerProtection.blurred.tint)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isActive
                          ? ComposerProtection.blurred.tint.opacity(0.15)
                          : Color.clear)
                    .overlay(
                        Capsule()
                            .stroke(isActive
                                    ? ComposerProtection.blurred.tint.opacity(0.3)
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
            toggleVeil(.viewOnce)
        } label: {
            HStack(spacing: 4) {
                Image(systemName: isActive ? MessageProtectionSymbols.viewOnceFilled : MessageProtectionSymbols.viewOnce)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? ComposerProtection.viewOnce.tint : mutedColor)

                if isActive {
                    Text(String(localized: "composer.viewonce.label", defaultValue: "Vue unique", bundle: .main))
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(ComposerProtection.viewOnce.tint)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isActive
                          ? ComposerProtection.viewOnce.tint.opacity(0.15)
                          : Color.clear)
                    .overlay(
                        Capsule()
                            .stroke(isActive
                                    ? ComposerProtection.viewOnce.tint.opacity(0.3)
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

    // ========================================================================
    // MARK: - La teinte de la barre (#7667)
    // ========================================================================

    /// La protection armée la plus forte — éphémère > vue unique > flou. Lue
    /// depuis les bascules de la barre elle-même : aucun hôte ne peut oublier
    /// de la substituer.
    var dominantProtection: ComposerProtection? {
        ComposerProtection.dominant(
            ephemeral: ephemeralDuration.wrappedValue != nil,
            viewOnce: isViewOnceEnabled.wrappedValue,
            blurred: isBlurEnabled.wrappedValue
        )
    }

    /// L'accent que TOUTE la barre sert à ses enfants : dépôt, vignettes,
    /// forme d'onde, bouton d'envoi.
    var servedAccentHex: String {
        ComposerProtection.servedAccent(
            for: dominantProtection,
            hostAccent: accentColor,
            hostSecondary: secondaryColor
        ).primary
    }

    /// Le jeton d'état quand une protection est armée — jamais `Color(hex:)`
    /// d'une variable pour une teinte que le design system déclare déjà.
    var servedAccent: Color {
        dominantProtection?.tint ?? Color(hex: accentColor)
    }

    var servedSecondary: Color {
        dominantProtection?.tint ?? Color(hex: secondaryColor)
    }

    /// Flou et vue unique sont exclusifs : allumer l'un éteint l'autre.
    func toggleVeil(_ veil: ComposerProtection) {
        let next = ComposerProtection.togglingVeil(
            veil,
            blurred: isBlurEnabled.wrappedValue,
            viewOnce: isViewOnceEnabled.wrappedValue
        )
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            if isBlurEnabled.wrappedValue != next.blurred { isBlurEnabled.wrappedValue = next.blurred }
            if isViewOnceEnabled.wrappedValue != next.viewOnce { isViewOnceEnabled.wrappedValue = next.viewOnce }
        }
    }

// MARK: - Effects Toggle Button (extension)

    var effectsToggleButton: some View {
        let isActive = pendingEffects.wrappedValue.hasAnyEffect
        let effectCount = pendingEffects.wrappedValue.flags.rawValue.nonzeroBitCount

        return Button {
            onAnyInteraction?()
            HapticFeedback.light()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showEphemeralPicker = false
                showEffectsPanel.toggle()
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: isActive ? "wand.and.stars" : "wand.and.stars")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? servedAccent : mutedColor)

                if isActive {
                    Text("\(effectCount)")
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(servedAccent)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isActive
                          ? servedAccent.opacity(0.15)
                          : Color.clear)
                    .overlay(
                        Capsule()
                            .stroke(isActive
                                    ? servedAccent.opacity(0.3)
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
                    .foregroundColor(isActive ? servedAccent : mutedColor)

                if isActive {
                    Text("\(activeCount)")
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(servedAccent)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isActive
                          ? servedAccent.opacity(0.15)
                          : Color.clear)
                    .overlay(
                        Capsule()
                            .stroke(isActive
                                    ? servedAccent.opacity(0.3)
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
                        .foregroundColor(isSelected ? .white : servedAccent)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(isSelected
                                      ? servedAccent
                                      : servedAccent.opacity(0.1))
                                .overlay(
                                    Capsule()
                                        .stroke(servedAccent.opacity(0.3), lineWidth: 0.5)
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
                        .stroke(servedAccent.opacity(0.2), lineWidth: 0.5)
                )
        )
        .padding(.horizontal, 8)
    }
}
