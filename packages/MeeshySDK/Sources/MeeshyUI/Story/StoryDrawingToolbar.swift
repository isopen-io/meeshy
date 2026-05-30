import SwiftUI
import MeeshySDK

/// Barre d'outils flottante du mode dessin, dockée en bas de l'écran (au-dessus du
/// band). Mirror de `StoryTextEditToolbar` : panneau d'options déplié (optionnel) +
/// rangée de bulles, posés sur un `.ultraThinMaterial` partagé.
///
/// Vide tant que `viewModel.drawingEditingMode` est `.inactive`.
struct StoryDrawingToolbar: View {
    @ObservedObject var viewModel: StoryComposerViewModel

    var body: some View {
        if case .active(let selectedStrokeId, let expandedTool) = viewModel.drawingEditingMode {
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                VStack(spacing: 10) {
                    // Panneau d'options du PINCEAU actif (nouveaux traits). Affiché
                    // seulement quand aucun trait n'est sélectionné — sinon l'édition
                    // par-trait se fait inline dans la liste verticale ci-dessous.
                    if let tool = expandedTool, selectedStrokeId == nil {
                        DrawingEditToolOptions(tool: tool, viewModel: viewModel)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    DrawingEditFloatingBubbles(
                        expandedTool: selectedStrokeId == nil ? expandedTool : nil,
                        onSelectTool: { tool in
                            // Les bulles règlent le pinceau actif → on désélectionne
                            // tout trait avant de déplier l'outil.
                            viewModel.selectStroke(nil)
                            viewModel.setExpandedDrawingTool(
                                (selectedStrokeId == nil && expandedTool == tool) ? nil : tool)
                            HapticFeedback.light()
                        },
                        onDismiss: {
                            // Quitter l'outil dessin : libère `activeTool` (l'overlay
                            // de capture est gaté dessus) ET sort du mode édition.
                            viewModel.activeTool = nil
                            viewModel.exitDrawingEditingMode()
                        }
                    )
                    // Liste verticale des traits : édition inline par-trait
                    // (couleur, style, épaisseur, suppression).
                    DrawingStrokeList(viewModel: viewModel)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(.ultraThinMaterial)
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.85),
                       value: viewModel.drawingEditingMode)
        }
    }
}
