import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le panneau CADRE** (#8414, maquette plein écran `iPad.dc.html`).
///
/// Chaque média garde son format : une photo 4:3 ou paysage n'est pas rognée
/// en 9:16. L'auteur choisit AJUSTER (le média entier, rien n'est rogné) ou
/// REMPLIR (il couvre la scène), et le fond des bandes d'un média ajusté.
struct ComposerFrameBand: View {
    let fitMode: String
    let backdrop: StoryBackdrop
    let plateauTint: Color
    let onPickFitMode: (String) -> Void
    let onPickBackdrop: (StoryBackdrop) -> Void

    var body: some View {
        // **Sans libellé** (directive porteur 2026-09-27 : « enlève les captions
        // partout ») : deux icônes de cadrage et cinq pastilles, chacune avec
        // son nom ACCESSIBLE — la vue ne perd rien pour VoiceOver.
        HStack(spacing: 12) {
            HStack(spacing: 8) {
                fitChoice(StoryBackgroundFraming.fit, label: ComposerFrameCopy.fit, symbol: "rectangle.center.inset.filled")
                fitChoice(StoryBackgroundFraming.fill, label: ComposerFrameCopy.fill, symbol: "rectangle.fill")
            }
            Divider()
                .frame(height: 28)
                .overlay(Color.white.opacity(0.25))
            HStack(spacing: 10) {
                ForEach(StoryBackdrop.allCases, id: \.self) { fond in
                    backdropChoice(fond)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(ComposerFrameCopy.title))
        .padding(10)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 18, style: .continuous),
                       tint: plateauTint.opacity(0.55))
        .padding(.horizontal, ComposerRailGeometry.outerMargin)
    }

    private func fitChoice(_ mode: String, label: String, symbol: String) -> some View {
        let choisi = fitMode == mode
        return Button {
            HapticFeedback.light()
            onPickFitMode(mode)
        } label: {
            Image(systemName: symbol)
                .font(.body.weight(.semibold))
                .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                .frame(width: 44, height: 44)
                .background(Circle().fill(choisi ? MeeshyColors.brandPrimary : Color.white.opacity(0.08)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
        .accessibilityAddTraits(choisi ? .isSelected : [])
    }

    private func backdropChoice(_ fond: StoryBackdrop) -> some View {
        let choisi = backdrop == fond && fitMode == StoryBackgroundFraming.fit
        return Button {
            HapticFeedback.light()
            onPickBackdrop(fond)
        } label: {
            Circle()
                .fill(swatch(fond))
                .frame(width: 30, height: 30)
                .overlay(Circle().strokeBorder(choisi ? MeeshyColors.brandPrimary : Color.white.opacity(0.35),
                                               lineWidth: choisi ? 3 : 1))
                .frame(width: 36, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(ComposerFrameCopy.label(fond)))
        .accessibilityAddTraits(choisi ? .isSelected : [])
    }

    private func swatch(_ fond: StoryBackdrop) -> AnyShapeStyle {
        guard let hex = fond.solidHex else {
            return AnyShapeStyle(LinearGradient(colors: [Color(hex: "FB923C"), Color(hex: "4F46E5")],
                                                startPoint: .topLeading, endPoint: .bottomTrailing))
        }
        return AnyShapeStyle(Color(hex: hex))
    }
}

/// **Le cadrage et le fond, écrits sur le transform du fond** — un site unique
/// pour le panneau, dont la règle se teste sans monter de vue.
nonisolated enum ComposerFraming {

    /// Ce que le RENDU applique : l'absence se rend REMPLIE (`rendersFilled`).
    static func fitMode(of transform: StoryBackgroundTransform?) -> String {
        StoryBackgroundFraming.rendersFilled(transform?.videoFitMode)
            ? StoryBackgroundFraming.fill : StoryBackgroundFraming.fit
    }

    static func backdrop(of transform: StoryBackgroundTransform?) -> StoryBackdrop {
        StoryBackdrop.resolve(transform?.backdrop)
    }

    static func applying(fitMode: String, to transform: StoryBackgroundTransform?) -> StoryBackgroundTransform? {
        var suivant = transform ?? StoryBackgroundTransform()
        suivant.videoFitMode = fitMode
        return suivant.isIdentity ? nil : suivant
    }

    /// Choisir un fond AJUSTE la scène : en REMPLI, le média couvre tout et le
    /// fond n'aurait aucune bande où se voir — le geste serait inerte.
    static func applying(backdrop: StoryBackdrop, to transform: StoryBackgroundTransform?) -> StoryBackgroundTransform? {
        var suivant = transform ?? StoryBackgroundTransform()
        suivant.backdrop = backdrop.rawValue
        suivant.videoFitMode = StoryBackgroundFraming.fit
        return suivant.isIdentity ? nil : suivant
    }
}

nonisolated enum ComposerFrameCopy {
    static var title: String {
        String(localized: "composer.frame.title", defaultValue: "Cadre", bundle: .main)
    }
    static var fit: String {
        String(localized: "composer.frame.fit", defaultValue: "Ajuster", bundle: .main)
    }
    static var fill: String {
        String(localized: "composer.frame.fill", defaultValue: "Remplir", bundle: .main)
    }
    static func label(_ fond: StoryBackdrop) -> String {
        switch fond {
        case .blur:   return String(localized: "composer.frame.backdrop.blur", defaultValue: "Flou", bundle: .main)
        case .black:  return String(localized: "composer.frame.backdrop.black", defaultValue: "Noir", bundle: .main)
        case .white:  return String(localized: "composer.frame.backdrop.white", defaultValue: "Blanc", bundle: .main)
        case .indigo: return String(localized: "composer.frame.backdrop.indigo", defaultValue: "Indigo", bundle: .main)
        case .sand:   return String(localized: "composer.frame.backdrop.sand", defaultValue: "Sable", bundle: .main)
        }
    }
}
