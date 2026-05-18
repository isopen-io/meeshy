import SwiftUI
import MeeshySDK

/// Rangée de bulles flottantes au-dessus du texte en édition : 6 bulles
/// d'outils (style / couleur / taille / alignement / fond / contour) + une
/// bulle X de sortie. Taille 36×36 (60% du FAB principal).
struct TextEditFloatingBubbles: View {
    let expandedTool: TextEditTool?
    let onSelectTool: (TextEditTool) -> Void
    let onDismiss: () -> Void

    @Environment(\.colorScheme) private var colorScheme

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

    private func bubble(tool: TextEditTool, isActive: Bool) -> some View {
        Image(systemName: tool.sfSymbol)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(isActive ? Color.white : (colorScheme == .dark ? .white : MeeshyColors.indigo950))
            .frame(width: 36, height: 36)
            .background(
                Circle()
                    .fill(isActive ? AnyShapeStyle(MeeshyColors.brandGradient) : AnyShapeStyle(Material.ultraThinMaterial))
            )
            .overlay(
                Circle().stroke(MeeshyColors.indigo400.opacity(0.5), lineWidth: 0.8)
            )
            .shadow(color: .black.opacity(0.15), radius: 6, y: 3)
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
            .background(Circle().fill(MeeshyColors.error.opacity(0.9)))
            .shadow(color: MeeshyColors.error.opacity(0.4), radius: 5, y: 2)
            .onTapGesture {
                HapticFeedback.medium()
                onDismiss()
            }
            .accessibilityLabel("Terminer l'édition du texte")
            .accessibilityHint("Ferme l'éditeur et masque le clavier")
            .accessibilityAddTraits(.isButton)
    }
}
