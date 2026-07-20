import SwiftUI
import MeeshySDK

/// Contrôleurs FLOTTANTS du pinceau (mode dessin), posés sur le canvas — mirror de
/// `StoryTextEditToolbar`. Panneau d'options déplié (optionnel) + rangée de bulles
/// (pinceau / couleur / épaisseur / lissage). La **liste des traits éditables** ne
/// vit PLUS ici : elle est dans la bande standard (`ComposerToolPanelHost` →
/// `drawingPanel`), comme tous les autres outils. `bottomInset` lève les bulles
/// au-dessus de la bande pour qu'elles ne soient pas masquées.
///
/// Vide tant que `viewModel.drawingEditingMode` est `.inactive`.
struct StoryDrawingToolbar: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    var bottomInset: CGFloat = 0

    var body: some View {
        if case .active(let selectedStrokeId, let expandedTool) = viewModel.drawingEditingMode {
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                // Plus de bandeau pleine largeur derrière les contrôleurs : les
                // bulles flottent NUES sur le canvas, comme les FABs et les
                // actions du header (directive user 2026-07-10 « icônes
                // flottantes sans arrière-plan »). Seul le panneau d'options
                // déplié garde un îlot de verre — il porte du CONTENU
                // (palette, sliders) qui a besoin d'une surface lisible.
                AdaptiveGlassContainer(spacing: 10) {
                    VStack(spacing: 10) {
                        // Panneau d'options du PINCEAU actif (nouveaux traits), déplié à
                        // la demande via les bulles. L'édition par-trait se fait, elle,
                        // dans la liste de la bande (réutilise `DrawingEditToolOptions`).
                        if let tool = expandedTool, selectedStrokeId == nil {
                            DrawingEditToolOptions(tool: tool, viewModel: viewModel)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 10)
                                .adaptiveGlass(in: RoundedRectangle(cornerRadius: 20, style: .continuous))
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
                            },
                            canUndo: viewModel.canUndoStroke,
                            canRedo: viewModel.canRedoStroke,
                            onUndo: { viewModel.undoLastStroke() },
                            onRedo: { viewModel.redoLastStroke() }
                        )
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .padding(.bottom, bottomInset)
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.85),
                       value: viewModel.drawingEditingMode)
            .animation(.spring(response: 0.3, dampingFraction: 0.85), value: bottomInset)
        }
    }
}
