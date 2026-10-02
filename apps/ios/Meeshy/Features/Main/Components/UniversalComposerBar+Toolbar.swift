import SwiftUI
import MeeshyUI
import AVFoundation
import Combine
import MeeshySDK

// MARK: - Extracted from UniversalComposerBar.swift

// ============================================================================
// MARK: - Barre d'outils du haut
// ============================================================================
//
// Découpage mécanique du fichier (#4104, budget 800–1100 lignes/fichier) —
// porte le chrome du haut : barre d'outils, pastille de sélection de
// langue, bouton d'icône générique de la barre d'outils et la poignée de
// balayage. Aucun changement de comportement, seulement un déplacement de
// lignes.

extension UniversalComposerBar {

    // ========================================================================
    // MARK: - Top Toolbar
    // ========================================================================

    var topToolbar: some View {
        ComposerToolbarStrip {
            // Ephemeral mode toggle (hidden for comments)
            if !resolvedHideEphemeral {
                ephemeralToggleButton
            }

            // Blur mode toggle
            if !hideBlur {
                blurToggleButton
            }

            // View-once mode toggle — À CÔTÉ du flou (#7472), et gardé par le
            // même genre de drapeau : les deux protections de masquage se
            // posent du même geste, au même endroit.
            if !resolvedHideViewOnce {
                viewOnceToggleButton
            }

            // Effects picker toggle (full sheet — messages only)
            if !resolvedHideEffects {
                effectsToggleButton
            }

            // Permanent effects inline toggle (comments only)
            if resolvedShowPermanentEffects {
                permanentEffectsToggleButton
            }

            // **Le sticker à la place de l'humeur** (#9082, directive porteur
            // 2026-10-02) : l'indicateur passif de tonalité laisse sa place à
            // la porte du sélecteur de stickers — rendue seulement si l'hôte
            // sait l'ouvrir (loi 4).
            if let openStickers = onRequestStickerPicker {
                glassDoorButton(
                    symbol: "rectangle.portrait.on.rectangle.portrait.angled",
                    label: String(localized: "composer.attach.sticker", defaultValue: "Sticker", bundle: .main),
                    action: openStickers)
            }

            // Language selector
            languageSelectorPill
        } trailing: {
            // Character counter
            if let maxLen = maxLength {
                let count = text.count
                if count > Int(Double(maxLen) * 0.8) {
                    Text("\(count)/\(maxLen)")
                        .font(.system(.caption2, design: .monospaced)).fontWeight(.semibold)
                        .foregroundColor(count >= maxLen ? MeeshyColors.error : mutedColor)
                        .transition(.opacity)
                }
            }

            // **La caméra à l'angle droit du verre** (#9082), juste avant le ⌄ ;
            // la photothèque (images ET vidéos) à côté d'elle (#9120).
            ForEach(ComposerGlassDoors.trailing(offersLibrary: onPhotoLibrary != nil,
                                                offersCamera: onCamera != nil,
                                                offersFold: resolvedFoldControl != nil), id: \.self) { door in
                switch door {
                case .library:
                    if let openLibrary = onPhotoLibrary {
                        glassDoorButton(
                            symbol: "photo.on.rectangle.angled",
                            label: String(localized: "composer.attach.photo", defaultValue: "Photos", bundle: .main),
                            action: openLibrary)
                    }
                case .camera:
                    if let openCamera = onCamera {
                        glassDoorButton(
                            symbol: "camera.fill",
                            label: String(localized: "composer.attach.camera", defaultValue: "Caméra", bundle: .main),
                            action: openCamera)
                    }
                case .fold:
                    if let fold = resolvedFoldControl {
                        foldButton(fold)
                            .transition(.opacity.combined(with: .scale(scale: 0.8, anchor: .topTrailing)))
                    }
                }
            }
        }
    }

    // ========================================================================
    // MARK: - Repli (#8642)
    // ========================================================================

    /// **Le ⌄ vit DANS le verre** (directive porteur 2026-09-29 : « doit être à
    /// l'intérieur, angle à droite de la plaque de verre »). Il flottait au-dessus
    /// de la plaque ; il ferme désormais la rangée d'outils, dont la bande
    /// `trailing` ne défile jamais — Dynamic Type ne peut pas le pousser hors de
    /// l'écran. Glyphe au format des outils (30 pt), cible de 44 pt.
    private func foldButton(_ fold: ComposerFoldControl) -> some View {
        Button(action: fold.action) {
            Image(systemName: fold.symbol)
                .font(.footnote.weight(.bold))
                .foregroundColor(iconTint)
                .frame(width: 30, height: 30)
                .adaptiveLiquidGlass(in: Circle(), interactive: true)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.vertical, -7)
        .accessibilityLabel(fold.label)
    }

    /// Une porte de la bande (#9082) : glyphe au format des outils (30 pt),
    /// cible de 44 pt, à la couleur servie.
    private func glassDoorButton(symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button {
            onAnyInteraction?()
            HapticFeedback.light()
            action()
        } label: {
            Image(systemName: symbol)
                .font(.callout.weight(.semibold))
                .foregroundColor(iconTint)
                .frame(width: 30, height: 30)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.vertical, -7)
        .accessibilityLabel(label)
    }

    // ========================================================================
    // MARK: - Language Selector Pill
    // ========================================================================

    private var languageSelectorPill: some View {
        Menu {
            ForEach(availableLanguages) { lang in
                Button {
                    currentLanguage = lang.code
                    onLanguageChange?(lang.code)
                    if let detected = DetectedLanguage.find(code: lang.code) {
                        textAnalyzer.lockToLanguage(detected)
                    }
                } label: {
                    HStack {
                        Text("\(lang.flag) \(lang.name)")
                        if lang.code == currentLanguage {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: MeeshySpacing.xxs) {
                Text(currentLangOption.flag)
                    .font(.caption)
                Text(currentLangOption.code.uppercased())
                    .font(.caption2).fontWeight(.semibold)
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.bold))
            }
            .fixedSize()
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.xs)
            .adaptiveLiquidGlass(in: Capsule(), tint: style == .dark ? nil : iconTint.opacity(0.18))
            .foregroundColor(iconTint)
        }
        .accessibilityLabel(String(localized: "a11y.composer.language", defaultValue: "Langue du message", bundle: .main))
        .accessibilityValue(currentLangOption.name)
        .accessibilityHint(String(localized: "a11y.composer.language.hint", defaultValue: "Choisir la langue d'envoi du message", bundle: .main))
    }

    // ========================================================================
    // MARK: - Toolbar Icon Button
    // ========================================================================

    // ========================================================================
    // MARK: - Swipe Handle
    // ========================================================================

    var swipeHandle: some View {
        HStack {
            Spacer()
            RoundedRectangle(cornerRadius: 2)
                .fill(style == .dark ? Color.white.opacity(0.2) : Color.black.opacity(0.12))
                .frame(width: 36, height: 4)
            Spacer()
        }
        .padding(.top, MeeshySpacing.sm)
        .padding(.bottom, MeeshySpacing.xxs)
    }
}

// ============================================================================
// MARK: - Bande de la barre d'outils (#7997)
// ============================================================================
//
// Un `HStack` dont aucun enfant ne se compresse (cadres de 30 pt, pastille de
// langue en `.fixedSize()`, capsules des protections) rend une largeur PLUS
// GRANDE que celle qu'on lui propose dès que Dynamic Type grossit les glyphes ;
// chaque parent non borné la reprend, et tout l'écran de conversation était
// mis en page sur 493 pt pour un iPhone de 402 pt. La bande garde la rangée
// telle quelle quand elle tient, et la fait DÉFILER horizontalement sinon :
// sa largeur ne dépasse jamais celle proposée.

/// **L'angle droit du verre** (#9082) : la caméra se pose juste avant le ⌄,
/// la photothèque à côté d'elle (#9120), et chaque porte n'existe que si
/// l'hôte sait l'ouvrir.
nonisolated enum ComposerGlassDoors {
    enum TrailingDoor: Hashable, Sendable {
        case library
        case camera
        case fold
    }

    static func trailing(offersLibrary: Bool, offersCamera: Bool, offersFold: Bool) -> [TrailingDoor] {
        (offersLibrary ? [.library] : []) + (offersCamera ? [.camera] : []) + (offersFold ? [.fold] : [])
    }
}

/// Le repli qu'un hôte confie à la barre (#8642) : son glyphe, son libellé
/// VoiceOver et son geste. La barre le pose ; l'hôte décide QUAND il existe.
struct ComposerFoldControl {
    let symbol: String
    let label: String
    let action: () -> Void
}

struct ComposerToolbarStrip<Leading: View, Trailing: View>: View {
    @ViewBuilder let leading: Leading
    @ViewBuilder let trailing: Trailing

    var body: some View {
        HStack(spacing: 6) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 6) {
                    leading
                    Spacer(minLength: 0)
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) { leading }
                }
            }
            trailing
        }
    }
}
