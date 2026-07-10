import SwiftUI
import MeeshySDK

/// Rangée de bulles flottantes du mode dessin : 5 bulles d'outils (pinceau / couleur /
/// épaisseur / lissage / calques) + une bulle X de sortie. Mirror exact de
/// `TextEditFloatingBubbles`.
///
/// Icônes flottantes SANS arrière-plan explicite (directive user 2026-07-10) :
/// même langage que les actions du header — `glassControlForeground` +
/// `adaptiveGlass` (Liquid Glass iOS 26 / material en fallback), l'outil actif
/// et le X passant en verre proéminent teinté.
struct DrawingEditFloatingBubbles: View {
    let expandedTool: DrawingEditTool?
    let onSelectTool: (DrawingEditTool) -> Void
    let onDismiss: () -> Void
    /// Undo / redo (retour arrière / avant) des traits, posés juste à gauche du X.
    var canUndo: Bool = false
    var canRedo: Bool = false
    var onUndo: () -> Void = {}
    var onRedo: () -> Void = {}

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
            .glassControlForeground()
            .frame(width: 36, height: 36)
            .adaptiveGlass(in: Circle())
            .opacity(enabled ? 1 : 0.4)
            .contentShape(Circle())
            .onTapGesture { if enabled { HapticFeedback.light(); action() } }
            .accessibilityLabel(label)
            .accessibilityAddTraits(.isButton)
            .accessibilityHint(enabled ? "" : "Indisponible")
    }

    @ViewBuilder
    private func bubble(tool: DrawingEditTool, isActive: Bool) -> some View {
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
            .accessibilityLabel("Terminer l'édition du dessin")
            .accessibilityHint("Ferme les contrôles de dessin")
            .accessibilityAddTraits(.isButton)
    }
}
