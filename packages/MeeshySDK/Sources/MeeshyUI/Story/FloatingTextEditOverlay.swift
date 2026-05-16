import SwiftUI
import MeeshySDK

/// Overlay plein écran d'édition de texte flottante. Présenté tant que
/// `viewModel.textEditingMode` est `.active`. Contient : un fond assombri,
/// la rangée de bulles flottantes, le champ d'édition centré (vrai textarea),
/// et le panneau d'options de l'outil déplié.
///
/// Sorties (toutes via le funnel unique `keyboardFocus = false`) :
/// 1. bulle X — 2. swipe-down du clavier — 3. tap sur le fond assombri.
/// Toucher le texte lui-même positionne le curseur — ce n'est PAS une sortie.
struct FloatingTextEditOverlay: View {
    @Bindable var viewModel: StoryComposerViewModel

    @FocusState private var keyboardFocus: Bool
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        if case .active(let textId, let expandedTool) = viewModel.textEditingMode,
           let binding = textObjectBinding(for: textId) {
            ZStack {
                // 1. Fond assombri — tap = sortie.
                Color.black.opacity(0.55)
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture { dismissKeyboardAndExit() }

                VStack(spacing: 0) {
                    Spacer(minLength: 40)

                    // 2. Rangée de bulles — la bulle X sort.
                    TextEditFloatingBubbles(
                        expandedTool: expandedTool,
                        onSelectTool: { tool in
                            viewModel.setExpandedTool(expandedTool == tool ? nil : tool)
                            HapticFeedback.light()
                        },
                        onDismiss: { dismissKeyboardAndExit() }
                    )
                    .padding(.horizontal, 16)

                    // 3. Champ d'édition centré — vrai textarea, le tap y
                    //    positionne le curseur (pas de sortie).
                    TextEditCenteredField(textObject: binding, focused: $keyboardFocus)
                        .padding(.horizontal, 20)
                        .padding(.top, 14)

                    // 4. Panneau d'options de l'outil déplié.
                    if let tool = expandedTool {
                        TextEditToolOptions(tool: tool, textObject: binding)
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    Spacer(minLength: 20)
                }
                .padding(.top, 8)
            }
            .onAppear { keyboardFocus = true }
            .onChange(of: keyboardFocus) { _, isFocused in
                // Funnel unique : tout dismiss du clavier (swipe-down, bulle X,
                // tap-outside) atterrit ici → sortie du mode édition.
                if !isFocused { viewModel.exitTextEditingMode() }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.85),
                       value: viewModel.textEditingMode)
        }
    }

    /// Funnel de sortie unique : résigne le clavier ; `onChange(of:keyboardFocus)`
    /// déclenche ensuite `exitTextEditingMode()`. Garantit qu'aucune sortie ne
    /// laisse le clavier monté.
    private func dismissKeyboardAndExit() {
        keyboardFocus = false
    }

    /// Binding live vers le `StoryTextObject` édité, dérivé de
    /// `currentEffects.textObjects`. Le setter remplace l'élément dans le
    /// tableau, propageant aux observateurs (canvas, badges) et déclenchant la
    /// re-sérialisation slide. Mirror de `ComposerBottomBand.textObjectBinding`.
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
