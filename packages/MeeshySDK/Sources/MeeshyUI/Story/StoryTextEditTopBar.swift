import SwiftUI
import MeeshySDK

/// Rangée d'attributs posée sous l'encoche pendant l'édition d'un texte.
///
/// Chaque bouton porte un attribut à valeurs discrètes et le fait tourner d'un
/// cran au tap, en montrant l'état courant plutôt qu'un pictogramme figé. Le
/// panneau détaillé reste joignable par appui long — rien n'est perdu, seul le
/// chemin le plus court change.
///
/// La rangée existe parce que les neuf outils plus la sortie ne tenaient pas
/// sur une seule ligne (432 pt demandés pour 361 disponibles) : les bulles des
/// deux extrémités étaient coupées, dont l'unique chemin de sortie.
struct StoryTextEditTopBar: View {
    @Binding var textObject: StoryTextObject
    let onOpenPanel: (TextEditTool) -> Void
    let onFinish: () -> Void

    var body: some View {
        HStack(spacing: TextEditToolbarMetrics.spacing) {
            AdaptiveGlassContainer(spacing: TextEditToolbarMetrics.spacing) {
                HStack(spacing: TextEditToolbarMetrics.spacing) {
                    ForEach(TextEditTool.topTools, id: \.self) { tool in
                        cycleButton(tool)
                    }
                }
            }
            Spacer(minLength: TextEditToolbarMetrics.spacing)
            finishButton
        }
        .padding(.horizontal, TextEditToolbarMetrics.horizontalMargin)
        .padding(.top, 6)
    }

    // MARK: - Bouton rotatif

    private func cycleButton(_ tool: TextEditTool) -> some View {
        let bubble = indicator(for: tool)
            .frame(width: TextEditToolbarMetrics.bubbleSize,
                   height: TextEditToolbarMetrics.bubbleSize)
            .adaptiveGlass(in: Circle())
            .contentShape(Circle())
        return bubble
            .onTapGesture {
                StoryTextAttributeCycle.advance(tool, on: &textObject)
                HapticFeedback.light()
            }
            // `highPriorityGesture` et non `.onLongPressGesture` : chaîné après
            // le tap, ce dernier reste plus proche de la vue et capte l'appui
            // sans jamais le résoudre — vérifié au simulateur, le maintien ne
            // déclenchait alors NI le cran suivant NI le panneau.
            .highPriorityGesture(
                LongPressGesture(minimumDuration: 0.4, maximumDistance: 24)
                    .onEnded { _ in
                        HapticFeedback.medium()
                        onOpenPanel(tool)
                    }
            )
            .modifier(CycleButtonAccessibility(
                label: tool.accessibilityLabel,
                value: Self.spokenValue(tool, of: textObject),
                onOpenPanel: { onOpenPanel(tool) }))
    }

    /// L'état courant, rendu par le bouton lui-même : la lettre témoin porte la
    /// graisse qu'elle applique, le carré du contour porte son épaisseur.
    @ViewBuilder
    private func indicator(for tool: TextEditTool) -> some View {
        switch StoryTextAttributeCycle.indicator(tool, of: textObject) {
        case .glyph(let letter, let weight):
            Text(letter)
                .font(.system(size: 17, weight: weight.swiftUIWeight))
                .glassControlForeground()
        case .symbol(let name, let emphasis):
            Image(systemName: name)
                .font(.system(size: 14, weight: Self.strokeWeight(emphasis)))
                .glassControlForeground()
        }
    }

    /// Rang de contour (0…4) traduit en poids de trait — le bouton montre
    /// ainsi l'épaisseur qu'il pose.
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
        case .weight:
            return TextEditLabels.title(for: text.parsedFontWeight ?? StoryTextAttributeCycle.defaultWeight)
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
        case .style, .color, .size, .background, .language:
            return ""
        }
    }
}

// MARK: - Accessibilité d'un bouton rotatif

/// Extrait de `cycleButton` : empilées en ligne, ces annotations faisaient
/// dépasser le vérificateur de types de son budget de temps.
private struct CycleButtonAccessibility: ViewModifier {
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

/// Partagé entre la rangée haute (lettre témoin) et le panneau détaillé (chips
/// rendus dans leur propre graisse) — d'où une extension de module et non une
/// copie privée par fichier.
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
