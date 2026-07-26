import SwiftUI
import MeeshySDK

/// Rangée de bulles flottantes au-dessus du clavier : les outils dont le
/// réglage demande un panneau (police, couleur, taille, fond, langue). Un tap
/// déplie ou replie le panneau correspondant.
///
/// Les attributs à valeurs discrètes ont rejoint `StoryTextEditTopBar` sous
/// l'encoche, et le bouton de sortie est devenu son « Terminé » : à neuf outils
/// plus la sortie, la rangée demandait 432 pt pour 361 disponibles et se
/// faisait couper aux deux bouts.
///
/// Icônes flottantes SANS arrière-plan explicite (directive user 2026-07-10) :
/// même langage que les actions du header — `glassControlForeground` +
/// `adaptiveGlass` (Liquid Glass iOS 26 / material en fallback), l'outil actif
/// passant en verre proéminent teinté.
struct TextEditFloatingBubbles: View {
    let expandedTool: TextEditTool?
    let onSelectTool: (TextEditTool) -> Void

    var body: some View {
        HStack(spacing: TextEditToolbarMetrics.spacing) {
            ForEach(TextEditTool.bottomTools, id: \.self) { tool in
                bubble(tool: tool, isActive: expandedTool == tool)
                    .onTapGesture { onSelectTool(tool) }
            }
            Spacer(minLength: 0)
        }
    }

    @ViewBuilder
    private func bubble(tool: TextEditTool, isActive: Bool) -> some View {
        Group {
            if isActive {
                Image(systemName: tool.sfSymbol)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(width: TextEditToolbarMetrics.bubbleSize,
                           height: TextEditToolbarMetrics.bubbleSize)
                    .adaptiveGlassProminent(in: Circle(), tint: MeeshyColors.brandPrimary)
            } else {
                Image(systemName: tool.sfSymbol)
                    .font(.system(size: 14, weight: .semibold))
                    .glassControlForeground()
                    .frame(width: TextEditToolbarMetrics.bubbleSize,
                           height: TextEditToolbarMetrics.bubbleSize)
                    .adaptiveGlass(in: Circle())
            }
        }
        .contentShape(Circle())
        .accessibilityLabel(tool.accessibilityLabel)
        .accessibilityAddTraits(.isButton)
    }
}
