import SwiftUI
import MeeshySDK

/// Rangée unique d'outils de texte, posée au-dessus du clavier.
///
/// Un tap fait tourner la valeur d'un cran et la rend immédiatement ; un appui
/// long ouvre le panneau complet. Le geste est le même sur les sept outils :
/// la répartition précédente en deux rangées — attributs cyclables en haut,
/// ouvre-panneaux en bas — obligeait à retenir quel outil habitait quelle
/// rangée pour deux gestes différents.
///
/// Chaque bulle rend son état COURANT plutôt qu'un pictogramme figé, sans quoi
/// parcourir quatorze couleurs au tap se ferait à l'aveugle.
///
/// Icônes flottantes SANS arrière-plan explicite (directive user 2026-07-10) :
/// même langage que les actions du header — `glassControlForeground` +
/// `adaptiveGlass`, l'outil dont le panneau est ouvert passant en verre
/// proéminent teinté.
struct TextEditFloatingBubbles: View {
    @Binding var textObject: StoryTextObject
    let expandedTool: TextEditTool?
    let onOpenPanel: (TextEditTool) -> Void

    var body: some View {
        // Huit bulles tiennent sur l'écran le plus étroit supporté (337 pt
        // demandés pour 343 disponibles, depuis #4870 — l'espacement est passé
        // de 8 à 7 pt pour la huitième). Le défilement est un filet : il
        // garantit qu'une neuvième déborde VISIBLEMENT au lieu de se faire
        // couper en silence, ce qui est le défaut qui avait imposé la
        // séparation en deux rangées.
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TextEditToolbarMetrics.spacing) {
                ForEach(TextEditTool.all, id: \.self) { tool in
                    bubble(tool)
                }
            }
        }
    }

    private func bubble(_ tool: TextEditTool) -> some View {
        let isActive = expandedTool == tool
        return indicatorView(for: tool)
            .frame(width: TextEditToolbarMetrics.bubbleSize,
                   height: TextEditToolbarMetrics.bubbleSize)
            .modifier(BubbleGlass(isActive: isActive))
            .contentShape(Circle())
            .onTapGesture {
                StoryTextAttributeCycle.advance(tool, on: &textObject)
                HapticFeedback.light()
            }
            .onLongPressGesture(minimumDuration: 0.4) {
                HapticFeedback.medium()
                onOpenPanel(tool)
            }
            .modifier(CycleButtonAccessibility(
                label: tool.accessibilityLabel,
                value: StoryTextEditTopBar.spokenValue(tool, of: textObject),
                onOpenPanel: { onOpenPanel(tool) }))
    }

    @ViewBuilder
    private func indicatorView(for tool: TextEditTool) -> some View {
        switch StoryTextAttributeCycle.indicator(tool, of: textObject) {
        case .styledGlyph(let letter, let style):
            Text(letter)
                .font(storyFont(for: style, size: 15))
                .glassControlForeground()
        case .effectGlyph(let letter, let effect):
            // L'ombre suit la lettre témoin, en blanc : c'est la couleur que
            // la bulle rend, quelle que soit celle du texte — une bulle de
            // 36 pt ne peut pas montrer l'effet ET la couleur, et la bulle
            // Couleur montre déjà la sienne.
            Text(letter)
                .font(.system(size: 15, weight: .bold))
                .glassControlForeground()
                .storyTextEffect(effect, fontSize: 15, textColor: .white)
        case .colorDot(let hex):
            Circle()
                .fill(Color(hex: hex))
                .frame(width: 18, height: 18)
                .overlay(Circle().stroke(Color.white.opacity(0.6), lineWidth: 1))
        case .backgroundSwatch(let hex, let isGlass):
            backgroundSwatch(hex: hex, isGlass: isGlass)
        case .code(let code):
            Text(code)
                .font(.system(size: 12, weight: .bold))
                .glassControlForeground()
        case .symbol(let name, let emphasis, let tint):
            symbolIndicator(name: name, emphasis: emphasis, tint: tint)
        }
    }

    /// Un symbole teinté par la couleur que l'outil applique. L'ombre portée
    /// garde le glyphe lisible quand cette couleur est claire et que le verre
    /// de la bulle l'est aussi — même remède que le liseré pointillé du
    /// canvas, qui flotte lui aussi sur un fond quelconque.
    @ViewBuilder
    private func symbolIndicator(name: String, emphasis: Int, tint: String?) -> some View {
        let glyph = Image(systemName: name)
            .font(.system(size: 14, weight: StoryTextEditTopBar.strokeWeight(emphasis)))
        if let tint {
            glyph
                .foregroundStyle(Color(hex: tint))
                .shadow(color: .black.opacity(0.35), radius: 1)
        } else {
            glyph.glassControlForeground()
        }
    }

    @ViewBuilder
    private func backgroundSwatch(hex: String?, isGlass: Bool) -> some View {
        if let hex {
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .fill(Color(hex: hex))
                .frame(width: 18, height: 18)
                .overlay(
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .stroke(Color.white.opacity(0.6), lineWidth: 1))
        } else {
            Image(systemName: isGlass ? "square.on.square.dashed" : "square.slash")
                .font(.system(size: 14, weight: .semibold))
                .glassControlForeground()
        }
    }
}

/// Le verre de la bulle. Extrait en `ViewModifier` : la branche ternaire
/// posée en ligne dans `bubble` faisait dépasser le vérificateur de types de
/// son budget de temps — même cause que `CycleButtonAccessibility`.
private struct BubbleGlass: ViewModifier {
    let isActive: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if isActive {
            content.adaptiveGlassProminent(in: Circle(), tint: MeeshyColors.brandPrimary)
        } else {
            content.adaptiveGlass(in: Circle())
        }
    }
}
