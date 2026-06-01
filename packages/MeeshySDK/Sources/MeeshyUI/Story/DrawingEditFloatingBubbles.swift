import SwiftUI
import MeeshySDK

/// Rangée de bulles flottantes du mode dessin : 5 bulles d'outils (pinceau / couleur /
/// épaisseur / lissage / calques) + une bulle X de sortie. Mirror exact de
/// `TextEditFloatingBubbles` (taille 36×36, `.ultraThinMaterial`, halo brandGradient
/// sur l'outil actif).
struct DrawingEditFloatingBubbles: View {
    let expandedTool: DrawingEditTool?
    let onSelectTool: (DrawingEditTool) -> Void
    let onDismiss: () -> Void
    /// Undo / redo (retour arrière / avant) des traits, posés juste à gauche du X.
    var canUndo: Bool = false
    var canRedo: Bool = false
    var onUndo: () -> Void = {}
    var onRedo: () -> Void = {}

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 8) {
            ForEach(DrawingEditTool.allCases, id: \.self) { tool in
                bubble(tool: tool, isActive: expandedTool == tool)
                    .onTapGesture { onSelectTool(tool) }
            }
            Spacer(minLength: 4)
            // Retour arrière / avant — juste à gauche du X (spec user 2026-06-01).
            actionBubble(symbol: "arrow.uturn.backward", enabled: canUndo,
                         label: "Annuler le dernier trait", action: onUndo)
            actionBubble(symbol: "arrow.uturn.forward", enabled: canRedo,
                         label: "Rétablir le trait annulé", action: onRedo)
            dismissBubble()
        }
    }

    /// Bulle d'action neutre (undo/redo), grisée + non-tappable quand désactivée.
    private func actionBubble(symbol: String, enabled: Bool, label: String, action: @escaping () -> Void) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(enabled ? (colorScheme == .dark ? Color.white : MeeshyColors.indigo950)
                                     : (colorScheme == .dark ? Color.white : MeeshyColors.indigo950).opacity(0.3))
            .frame(width: 36, height: 36)
            .background(Circle().fill(Material.ultraThinMaterial))
            .overlay(Circle().stroke(MeeshyColors.indigo400.opacity(enabled ? 0.5 : 0.2), lineWidth: 0.8))
            .shadow(color: .black.opacity(0.12), radius: 5, y: 2)
            .opacity(enabled ? 1 : 0.55)
            .contentShape(Circle())
            .onTapGesture { if enabled { HapticFeedback.light(); action() } }
            .accessibilityLabel(label)
            .accessibilityAddTraits(.isButton)
            .accessibilityHint(enabled ? "" : "Indisponible")
    }

    private func bubble(tool: DrawingEditTool, isActive: Bool) -> some View {
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
            .accessibilityLabel("Terminer l'édition du dessin")
            .accessibilityHint("Ferme les contrôles de dessin")
            .accessibilityAddTraits(.isButton)
    }
}
