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
        let isImposed = imposedProtection.ephemeral != nil
        let isActive = ephemeralChoice.wrappedValue != nil || isImposed

        Button {
            guard !isImposed else { return }
            onAnyInteraction?()
            HapticFeedback.light()
            if isActive {
                ephemeralChoice.wrappedValue = nil
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
            HStack(spacing: MeeshySpacing.xs) {
                if ephemeralChoice.wrappedValue == .afterRead {
                    FlameEyeGlyph(size: 15, tint: ComposerProtection.ephemeral.tint)
                } else {
                    Image(systemName: isActive ? MessageProtectionSymbols.ephemeralFilled : MessageProtectionSymbols.ephemeral)
                        .font(.caption.weight(.semibold))
                        .foregroundColor(isActive ? ComposerProtection.ephemeral.tint : mutedColor)
                }

                if case .duration(let duration) = ephemeralChoice.wrappedValue {
                    Text(duration.label)
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(ComposerProtection.ephemeral.tint)
                }
                if isImposed { imposedLockGlyph(tint: ComposerProtection.ephemeral.tint) }
            }
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.xs)
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
        .accessibilityLabel(isImposed
                            ? String(localized: "composer.ephemeral.imposed", defaultValue: "Mode éphémère imposé par le message cité : \(EphemeralChoiceCopy.displayLabel(ephemeralChoice.wrappedValue))", bundle: .main)
                            : isActive
                            ? String(localized: "composer.ephemeral.active", defaultValue: "Mode ephemere actif: \(EphemeralChoiceCopy.displayLabel(ephemeralChoice.wrappedValue))", bundle: .main)
                            : String(localized: "composer.ephemeral.activate", defaultValue: "Activer le mode éphémère", bundle: .main))
        .accessibilityRemoveTraits(isImposed ? .isButton : [])
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isActive)
    }

    // ========================================================================
    // MARK: - Ephemeral Duration Picker
    // ========================================================================

    /// La flamme-œil, 15 s, puis les durées existantes (#8303).
    var ephemeralDurationPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.sm) {
                Button {
                    HapticFeedback.light()
                    ephemeralChoice.wrappedValue = nil
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showEphemeralPicker = false
                    }
                } label: {
                    Text(String(localized: "composer.ephemeral.off", defaultValue: "Désactivé", bundle: .main))
                        .font(.caption).fontWeight(.semibold)
                        .foregroundColor(ephemeralChoice.wrappedValue == nil ? .white : mutedColor)
                        .padding(.horizontal, MeeshySpacing.mdPlus)
                        .padding(.vertical, MeeshySpacing.xsPlus)
                        .background(
                            Capsule()
                                .fill(ephemeralChoice.wrappedValue == nil
                                      ? servedAccent
                                      : style == .dark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
                        )
                }

                ForEach(EphemeralChoice.menu) { choice in
                    ephemeralChoiceChip(choice)
                }
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.sm)
        }
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(railSurface)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .stroke(ComposerProtection.ephemeral.tint.opacity(0.2), lineWidth: MeeshyBorder.hairline)
                )
        )
        .padding(.horizontal, MeeshySpacing.sm)
    }

    /// Le rail qui s'ouvre au-dessus de la barre d'outils garde cette marge
    /// avec le bord HAUT du verre (#7966).
    static let railTopInset: CGFloat = 8

    /// Le fond commun des rails du composeur — durée éphémère, effets.
    var railSurface: Color {
        style == .dark || isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.9)
    }

    /// Une pastille du sélecteur : la flamme-œil porte son pictogramme et son
    /// libellé, une durée porte la flamme et ses secondes.
    func ephemeralChoiceChip(_ choice: EphemeralChoice) -> some View {
        let isSelected = ephemeralChoice.wrappedValue == choice
        let tint = ComposerProtection.ephemeral.tint
        return Button {
            HapticFeedback.light()
            ephemeralChoice.wrappedValue = choice
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showEphemeralPicker = false
            }
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                if choice == .afterRead {
                    FlameEyeGlyph(size: 13, tint: isSelected ? .white : tint)
                } else {
                    Image(systemName: MessageProtectionSymbols.ephemeralFilled)
                        .font(.caption2)
                }
                Text(EphemeralChoiceCopy.chipLabel(choice))
                    .font(.caption).fontWeight(.semibold)
            }
            .foregroundColor(isSelected ? .white : tint)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.xsPlus)
            .background(
                Capsule()
                    .fill(isSelected ? tint : tint.opacity(0.1))
                    .overlay(Capsule().stroke(tint.opacity(0.3), lineWidth: MeeshyBorder.hairline))
            )
        }
        .accessibilityLabel(EphemeralChoiceCopy.displayLabel(choice))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    // ========================================================================
    // MARK: - Blur Toggle Button
    // ========================================================================

    @ViewBuilder
    var blurToggleButton: some View {
        let isImposed = imposedProtection.blurred
        let isActive = isBlurEnabled.wrappedValue || isImposed

        Button {
            guard !isImposed else { return }
            onAnyInteraction?()
            HapticFeedback.light()
            toggleVeil(.blurred)
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: isActive ? MessageProtectionSymbols.blurredFilled : MessageProtectionSymbols.blurred)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? ComposerProtection.blurred.tint : mutedColor)

                if isActive {
                    Text(String(localized: "composer.blur.label", defaultValue: "Flou", bundle: .main))
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(ComposerProtection.blurred.tint)
                }
                if isImposed { imposedLockGlyph(tint: ComposerProtection.blurred.tint) }
            }
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.xs)
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
        .accessibilityLabel(isImposed
                            ? String(localized: "composer.blur.imposed", defaultValue: "Flou imposé par le message cité", bundle: .main)
                            : isActive
                            ? String(localized: "composer.blur.active", defaultValue: "Mode flou actif", bundle: .main)
                            : String(localized: "composer.blur.activate", defaultValue: "Activer le mode flou", bundle: .main))
        .accessibilityRemoveTraits(isImposed ? .isButton : [])
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
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: isActive ? MessageProtectionSymbols.viewOnceFilled : MessageProtectionSymbols.viewOnce)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? ComposerProtection.viewOnce.tint : mutedColor)

                if isActive {
                    Text(String(localized: "composer.viewonce.label", defaultValue: "Vue unique", bundle: .main))
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(ComposerProtection.viewOnce.tint)
                }
            }
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.xs)
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
            ephemeral: ephemeralChoice.wrappedValue != nil || imposedProtection.ephemeral != nil,
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

    /// Le cadenas d'une protection imposée par le message cité (#8557).
    func imposedLockGlyph(tint: Color) -> some View {
        Image(systemName: "lock.fill")
            .font(MeeshyFont.relative(8, weight: .bold))
            .foregroundColor(tint)
            .accessibilityHidden(true)
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
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: isActive ? "wand.and.stars" : "wand.and.stars")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? servedAccent : mutedColor)

                if isActive {
                    Text("\(effectCount)")
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(servedAccent)
                }
            }
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.xs)
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
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: isActive ? "wand.and.stars" : "wand.and.stars")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? servedAccent : mutedColor)

                if isActive {
                    Text("\(activeCount)")
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(servedAccent)
                }
            }
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.xs)
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
            HStack(spacing: MeeshySpacing.sm) {
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
                        HStack(spacing: MeeshySpacing.xs) {
                            Image(systemName: item.icon)
                                .font(.caption2)
                            Text(item.label)
                                .font(.caption).fontWeight(.semibold)
                        }
                        .foregroundColor(isSelected ? .white : servedAccent)
                        .padding(.horizontal, MeeshySpacing.mdPlus)
                        .padding(.vertical, MeeshySpacing.xsPlus)
                        .background(
                            Capsule()
                                .fill(isSelected
                                      ? servedAccent
                                      : servedAccent.opacity(0.1))
                                .overlay(
                                    Capsule()
                                        .stroke(servedAccent.opacity(0.3), lineWidth: MeeshyBorder.hairline)
                                )
                        )
                    }
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isSelected)
                    .accessibilityLabel(String(localized: "composer.effects.item.state", defaultValue: "\(item.label), \(isSelected ? String(localized: "common.active", defaultValue: "actif", bundle: .main) : String(localized: "common.inactive", defaultValue: "inactif", bundle: .main))", bundle: .main))
                    .accessibilityAddTraits(isSelected ? .isSelected : [])
                }
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.sm)
        }
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(style == .dark ? Color.black.opacity(0.3) : isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.9))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .stroke(servedAccent.opacity(0.2), lineWidth: MeeshyBorder.hairline)
                )
        )
        .padding(.horizontal, MeeshySpacing.sm)
    }
}
