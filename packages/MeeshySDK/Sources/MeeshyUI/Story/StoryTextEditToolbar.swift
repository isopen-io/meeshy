import SwiftUI
import MeeshySDK

/// Barre d'outils de mise en forme du texte, dockée en bas de l'écran (le
/// `StoryComposerView` la remonte au-dessus du clavier). Remplace l'ancien
/// `FloatingTextEditOverlay` plein écran : plus de voile sombre, plus de champ
/// recentré — le texte s'édite en place dans le canvas via `StoryInlineTextEditor`.
///
/// Vide tant que `viewModel.textEditingMode` est `.inactive`.
struct StoryTextEditToolbar: View {
    @ObservedObject var viewModel: StoryComposerViewModel

    var body: some View {
        if case .active(let textId, let expandedTool) = viewModel.textEditingMode,
           let binding = textObjectBinding(for: textId) {
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                // Plus de bandeau pleine largeur derrière les contrôleurs :
                // les bulles flottent NUES sur le canvas, comme les FABs et
                // les actions du header (directive user 2026-07-10 « icônes
                // flottantes sans arrière-plan »). Seul le panneau d'options
                // déplié garde un îlot de verre — il porte du CONTENU
                // (pastilles, sliders) qui a besoin d'une surface lisible.
                AdaptiveGlassContainer(spacing: 10) {
                    VStack(spacing: 10) {
                        if let tool = expandedTool {
                            TextEditToolOptions(tool: tool, textObject: binding)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 10)
                                .adaptiveGlass(in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                        }
                        TextEditFloatingBubbles(
                            expandedTool: expandedTool,
                            onSelectTool: { tool in
                                viewModel.setExpandedTool(expandedTool == tool ? nil : tool)
                                HapticFeedback.light()
                            },
                            onDismiss: { viewModel.exitTextEditingMode() }
                        )
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.85),
                       value: viewModel.textEditingMode)
        }
    }

    /// Binding live vers le `StoryTextObject` édité — alimente les outils de
    /// mise en forme. Retourne `nil` si l'élément n'existe plus.
    private func textObjectBinding(for id: String) -> Binding<StoryTextObject>? {
        guard viewModel.currentEffects.textObjects.contains(where: { $0.id == id }) else { return nil }
        return Binding(
            get: {
                viewModel.currentEffects.textObjects.first(where: { $0.id == id })
                    ?? StoryTextObject(text: "")
            },
            set: { newValue in
                var effects = viewModel.currentEffects
                if let i = effects.textObjects.firstIndex(where: { $0.id == id }) {
                    effects.textObjects[i] = newValue
                    viewModel.currentEffects = effects
                }
            }
        )
    }
}
