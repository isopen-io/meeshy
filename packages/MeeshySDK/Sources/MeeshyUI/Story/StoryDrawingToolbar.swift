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
        if case .active(_, let expandedTool) = viewModel.drawingEditingMode {
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                VStack(spacing: 10) {
                    if let tool = expandedTool {
                        DrawingEditToolOptions(tool: tool, viewModel: viewModel)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    DrawingEditFloatingBubbles(
                        expandedTool: expandedTool,
                        onSelectTool: { tool in
                            viewModel.setExpandedDrawingTool(expandedTool == tool ? nil : tool)
                            HapticFeedback.light()
                        },
                        onDismiss: {
                            // Quitter l'outil dessin : libère `activeTool` (l'overlay
                            // de capture est gaté dessus) ET sort du mode édition.
                            viewModel.activeTool = nil
                            viewModel.exitDrawingEditingMode()
                        }
                    )
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
