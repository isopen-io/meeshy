import SwiftUI
import MeeshySDK

/// Rangée posée sous l'encoche pendant l'édition d'un texte : elle ne porte
/// plus que la sortie.
///
/// Les attributs qui l'occupaient sont redescendus sur la rangée unique
/// (`TextEditFloatingBubbles`), avec le même geste pour tous — tap pour la
/// valeur suivante, appui long pour le panneau. La séparation en deux rangées
/// répondait à un débordement de largeur ; retirer taille et graisse, devenues
/// des curseurs, l'a rendue inutile.
struct StoryTextEditTopBar: View {
    let onFinish: () -> Void

    var body: some View {
        HStack {
            Spacer(minLength: TextEditToolbarMetrics.spacing)
            finishButton
        }
        .padding(.horizontal, TextEditToolbarMetrics.horizontalMargin)
        .padding(.top, 6)
    }

    /// Rang de contour (0…4) traduit en poids de trait — la bulle montre
    /// ainsi l'épaisseur qu'elle pose. Consommé par `TextEditFloatingBubbles`.
    static func strokeWeight(_ emphasis: Int) -> Font.Weight {
        switch emphasis {
        case ...0: return .regular
        case 1:    return .light
        case 2:    return .regular
        case 3:    return .bold
        default:   return .black
        }
    }

    // MARK: - Sortie

    /// Remplace le X rouge de l'ancienne rangée basse. « Terminé » dit ce que
    /// l'action fait : elle referme l'éditeur, elle ne supprime rien.
    private var finishButton: some View {
        Text(String(localized: "story.textEdit.finish.short",
                    defaultValue: "Terminé", bundle: .module))
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(Color.white)
            .lineLimit(1)
            .padding(.horizontal, 18)
            .frame(height: TextEditToolbarMetrics.bubbleSize)
            .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.brandPrimary)
            .contentShape(Capsule())
            .onTapGesture {
                HapticFeedback.medium()
                onFinish()
            }
            .accessibilityLabel(String(
                localized: "story.textEdit.finish",
                defaultValue: "Terminer l'édition du texte", bundle: .module))
            .accessibilityHint(String(
                localized: "story.textEdit.finish.hint",
                defaultValue: "Ferme l'éditeur et masque le clavier", bundle: .module))
            .accessibilityAddTraits(.isButton)
    }

    // MARK: - Accessibilité

    /// Ce que VoiceOver annonce comme valeur courante — l'indicateur visuel
    /// n'a aucun équivalent parlé sans cela.
    static func spokenValue(_ tool: TextEditTool, of text: StoryTextObject) -> String {
        switch tool {
        case .frame:
            return TextEditLabels.title(for: text.parsedFrameShape)
        case .align:
            return TextEditLabels.alignTitle(for: text.textAlign ?? StoryTextAttributeCycle.defaultAlign)
        case .border:
            let width = text.borderWidth ?? 0
            guard width > 0 else {
                return String(localized: "story.composer.noEffect", defaultValue: "Aucun", bundle: .module)
            }
            return "\(Int(width)) pt"
        case .style:
            return text.parsedTextStyle.displayName
        case .effect:
            return TextEditLabels.title(for: text.parsedTextEffect)
        case .language:
            return (TextEditToolOptions.normalisedCode(text.sourceLanguage) ?? "fr").uppercased()
        case .color, .background:
            return ""
        }
    }
}

// MARK: - Accessibilité d'un bouton rotatif

/// Extrait de la construction de bulle : empilées en ligne, ces annotations
/// faisaient dépasser le vérificateur de types de son budget de temps.
struct CycleButtonAccessibility: ViewModifier {
    let label: String
    let value: String
    let onOpenPanel: () -> Void

    func body(content: Content) -> some View {
        content
            .accessibilityElement()
            .accessibilityLabel(label)
            .accessibilityValue(value)
            .accessibilityHint(String(
                localized: "story.textEdit.cycle.hint",
                defaultValue: "Touchez pour la valeur suivante, appui long pour toutes les options",
                bundle: .module))
            .accessibilityAddTraits(.isButton)
            .accessibilityAction(named: String(
                localized: "story.textEdit.cycle.allOptions",
                defaultValue: "Toutes les options", bundle: .module), onOpenPanel)
    }
}

// MARK: - Graisse SwiftUI

/// Partagé entre le curseur de graisse du panneau Police et les chips rendus
/// dans leur propre graisse — d'où une extension de module et non une copie
/// privée par fichier.
extension StoryTextWeight {
    var swiftUIWeight: Font.Weight {
        switch self {
        case .thin:     return .thin
        case .normal:   return .regular
        case .semibold: return .semibold
        case .bold:     return .bold
        }
    }
}
