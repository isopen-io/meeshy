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
            if !hideViewOnce {
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

            // Sentiment indicator — LECTURE SEULE.
            // C'était un `Button` dont l'action se limitait à un retour
            // haptique : il se présentait comme actionnable (et comme tel à
            // VoiceOver) sans mener nulle part. Rendu passif, il reste lisible
            // par les technologies d'assistance via label + valeur.
            Text(textAnalyzer.sentiment.emoji)
                .font(.callout)
                .frame(width: 30, height: 30)
                .animation(.spring(response: 0.3, dampingFraction: 0.5), value: textAnalyzer.sentiment)
                .accessibilityElement()
                .accessibilityLabel(String(localized: "a11y.composer.sentiment", defaultValue: "Tonalité du message", bundle: .main))
                .accessibilityValue(textAnalyzer.sentiment.emoji)

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
        }
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
            HStack(spacing: 3) {
                Text(currentLangOption.flag)
                    .font(.caption)
                Text(currentLangOption.code.uppercased())
                    .font(.caption2).fontWeight(.semibold)
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.bold))
            }
            .fixedSize()
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .adaptiveLiquidGlass(in: Capsule(), tint: style == .dark ? nil : servedAccent.opacity(0.18))
            .foregroundColor(
                style == .dark
                    ? .white.opacity(0.9)
                    : servedAccent
            )
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
        .padding(.top, 8)
        .padding(.bottom, 2)
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
