import SwiftUI
import MeeshySDK

/// Champ d'édition de texte centré du mode flottant — un vrai textarea
/// multi-ligne, éditable. Toucher le texte positionne le curseur / sélectionne
/// (ce n'est PAS une sortie). Le texte s'affiche à sa taille réelle 1:1, passe
/// à la ligne automatiquement, sans aucune troncature.
struct TextEditCenteredField: View {
    @Binding var textObject: StoryTextObject
    var focused: FocusState<Bool>.Binding

    @Environment(\.colorScheme) private var colorScheme

    /// `fontSize` (design-pixels, référentiel 1080) projeté en points écran —
    /// 1:1 avec le rendu canvas (le canvas occupe la pleine largeur). Plancher
    /// à 24pt pour que les très petites polices restent éditables ; aucun
    /// plafond, donc les grandes polices s'affichent grandes (l'ancien éditeur
    /// les capait à 20pt → texte « trop petit »).
    private var screenFontSize: CGFloat {
        let ratio = UIScreen.main.bounds.width / 1080.0
        return max(24, CGFloat(textObject.fontSize) * ratio)
    }

    private var textAlignment: TextAlignment {
        switch textObject.textAlign {
        case "left":  return .leading
        case "right": return .trailing
        default:      return .center
        }
    }

    private var frameAlignment: Alignment {
        switch textObject.textAlign {
        case "left":  return .leading
        case "right": return .trailing
        default:      return .center
        }
    }

    var body: some View {
        TextField(
            String(localized: "story.textEditor.placeholder",
                   defaultValue: "Saisissez votre texte…", bundle: .module),
            text: $textObject.text,
            axis: .vertical
        )
        .focused(focused)
        .font(storyFont(for: textObject.parsedTextStyle, size: screenFontSize))
        .foregroundStyle(Color(hex: textObject.textColor ?? "FFFFFF"))
        .multilineTextAlignment(textAlignment)
        .lineLimit(nil)
        .textFieldStyle(.plain)
        .tint(MeeshyColors.indigo300)
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: frameAlignment)
        .background(fieldBackground)
        .accessibilityLabel("Champ d'édition du texte")
        .accessibilityHint("Touchez pour positionner le curseur ou sélectionner le texte")
    }

    /// Reflète le fond du texte (`backgroundStyle`). En `.none`, un voile léger
    /// matérialise la zone éditable sur le canvas assombri. Le contour
    /// (`borderColor`) n'est pas répliqué ici — il se rend au glyphe près sur
    /// le canvas via `StoryTextLayer`.
    @ViewBuilder
    private var fieldBackground: some View {
        switch textObject.resolvedBackgroundStyle {
        case .none:
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white.opacity(colorScheme == .dark ? 0.08 : 0.12))
        case .solid(let hex):
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(hex: hex))
        case .glass:
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.ultraThinMaterial)
        }
    }
}
