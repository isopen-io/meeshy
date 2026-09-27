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
        VStack(alignment: .leading, spacing: 10) {
            Text(ComposerFrameCopy.title)
                .font(.caption.weight(.semibold))
                .foregroundColor(MeeshyColors.textSecondary(isDark: true))
                .accessibilityAddTraits(.isHeader)
            HStack(spacing: 8) {
                fitChoice(StoryBackgroundFraming.fit, label: ComposerFrameCopy.fit, symbol: "rectangle.center.inset.filled")
                fitChoice(StoryBackgroundFraming.fill, label: ComposerFrameCopy.fill, symbol: "rectangle.fill")
            }
            HStack(spacing: 12) {
                ForEach(StoryBackdrop.allCases, id: \.self) { fond in
                    backdropChoice(fond)
                }
            }
        }
        .padding(12)
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
            Label(label, systemImage: symbol)
                .font(.footnote.weight(.semibold))
                .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                .padding(.horizontal, 14)
                .frame(minHeight: 44)
                .background(Capsule().fill(choisi ? MeeshyColors.brandPrimary : Color.white.opacity(0.08)))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(choisi ? .isSelected : [])
    }

    private func backdropChoice(_ fond: StoryBackdrop) -> some View {
        let choisi = backdrop == fond && fitMode == StoryBackgroundFraming.fit
        return Button {
            HapticFeedback.light()
            onPickBackdrop(fond)
        } label: {
            VStack(spacing: 4) {
                Circle()
                    .fill(swatch(fond))
                    .frame(width: 32, height: 32)
                    .overlay(Circle().strokeBorder(choisi ? MeeshyColors.brandPrimary : Color.white.opacity(0.35),
                                                   lineWidth: choisi ? 3 : 1))
                Text(ComposerFrameCopy.label(fond))
                    .font(.caption2)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .foregroundColor(MeeshyColors.textSecondary(isDark: true))
            }
            .frame(minWidth: 44, minHeight: 44)
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
