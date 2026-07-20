import SwiftUI
import MeeshySDK

/// Rangée de bulles flottantes au-dessus du texte en édition : 6 bulles
/// d'outils (style / couleur / taille / alignement / fond / contour) + une
/// bulle X de sortie. Taille 36×36 (60% du FAB principal).
///
/// Icônes flottantes SANS arrière-plan explicite (directive user 2026-07-10) :
/// même langage que les actions du header — `glassControlForeground` +
/// `adaptiveGlass` (Liquid Glass iOS 26 / material en fallback), l'outil actif
/// et le X passant en verre proéminent teinté.
struct TextEditFloatingBubbles: View {
    let expandedTool: TextEditTool?
    let onSelectTool: (TextEditTool) -> Void
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            ForEach(TextEditTool.allCases, id: \.self) { tool in
                bubble(tool: tool, isActive: expandedTool == tool)
                    .onTapGesture { onSelectTool(tool) }
            }
            Spacer(minLength: 4)
            dismissBubble()
        }
    }

    @ViewBuilder
    private func bubble(tool: TextEditTool, isActive: Bool) -> some View {
        Group {
            if isActive {
                Image(systemName: tool.sfSymbol)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(width: 36, height: 36)
                    .adaptiveGlassProminent(in: Circle(), tint: MeeshyColors.brandPrimary)
            } else {
                Image(systemName: tool.sfSymbol)
                    .font(.system(size: 14, weight: .semibold))
                    .glassControlForeground()
                    .frame(width: 36, height: 36)
                    .adaptiveGlass(in: Circle())
            }
        }
        .contentShape(Circle())
        .accessibilityLabel(tool.accessibilityLabel)
        .accessibilityAddTraits(.isButton)
    }

    /// Bulle X — sortie garantie. `onDismiss` est mappé par le parent sur le
    /// funnel `keyboardFocus = false`, donc le clavier descend toujours.
    private func dismissBubble() -> some View {
        Image(systemName: "xmark")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: 36, height: 36)
            .adaptiveGlassProminent(in: Circle(), tint: MeeshyColors.error)
            .contentShape(Circle())
            .onTapGesture {
                HapticFeedback.medium()
                onDismiss()
            }
            .accessibilityLabel(String(localized: "story.textEdit.finish", defaultValue: "Terminer l'édition du texte", bundle: .module))
            .accessibilityHint(String(localized: "story.textEdit.finish.hint", defaultValue: "Ferme l'éditeur et masque le clavier", bundle: .module))
            .accessibilityAddTraits(.isButton)
    }
}
