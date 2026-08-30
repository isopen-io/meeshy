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
        HStack(spacing: 6) {
            // Ephemeral mode toggle (hidden for comments)
            if !resolvedHideEphemeral {
                ephemeralToggleButton
            }

            // Blur mode toggle
            if !hideBlur {
                blurToggleButton
            }

            // View-once mode toggle (opt-in — notification preview composer)
            if showViewOnce {
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

            Spacer()

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
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(
                        style == .dark
                            ? Color.white.opacity(0.15)
                            : Color(hex: accentColor).opacity(0.15)
                    )
            )
            .foregroundColor(
                style == .dark
                    ? .white.opacity(0.9)
                    : Color(hex: accentColor)
            )
        }
        .accessibilityLabel(String(localized: "a11y.composer.language", defaultValue: "Langue du message", bundle: .main))
        .accessibilityValue(currentLangOption.name)
        .accessibilityHint(String(localized: "a11y.composer.language.hint", defaultValue: "Choisir la langue d'envoi du message", bundle: .main))
    }

    // ========================================================================
    // MARK: - Toolbar Icon Button
    // ========================================================================

    private func toolbarButton(icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.subheadline.weight(.medium))
                .foregroundColor(mutedColor)
                .frame(width: 30, height: 30)
                .contentShape(Circle())
        }
        .disabled(isRecording)
        .opacity(isRecording ? 0.4 : 1)
    }

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
