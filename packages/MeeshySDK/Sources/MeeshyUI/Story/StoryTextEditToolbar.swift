import SwiftUI
import MeeshySDK

/// Contrôles de mise en forme du texte pendant l'édition.
///
/// En HAUT, sous l'encoche : la sortie (`StoryTextEditTopBar`). En BAS, au
/// -dessus du clavier : la rangée unique d'outils (`TextEditFloatingBubbles`)
/// et le panneau de l'outil déplié.
///
/// Deux gestes, deux portées : toucher hors d'un panneau ouvert le REFERME et
/// rend la main aux bulles ; seul « Terminé » quitte l'édition. Sans cette
/// distinction, refermer un panneau demandait de retrouver sa bulle d'origine.
///
/// Vide tant que `viewModel.textEditingMode` est `.inactive`.
struct StoryTextEditToolbar: View {
    @ObservedObject var viewModel: StoryComposerViewModel

    /// Rapporte le Y (écran) du bord SUPÉRIEUR de la rangée de contrôles —
    /// panneau déplié compris. Le composer le transmet au canvas, qui garde la
    /// dernière ligne du texte édité au-dessus (directive user 2026-07-30).
    /// `.greatestFiniteMagnitude` quand l'éditeur est fermé : aucun plafond.
    var onControlsTopYChange: ((CGFloat) -> Void)? = nil

    var body: some View {
        if case .active(let textId, let expandedTool) = viewModel.textEditingMode,
           let binding = textObjectBinding(for: textId) {
            ZStack {
                if expandedTool != nil {
                    dismissCatcher
                }
                VStack(spacing: 0) {
                    StoryTextEditTopBar(onFinish: { viewModel.exitTextEditingMode() })

                    Spacer(minLength: 0)

                    bottomRow(expandedTool: expandedTool, binding: binding)
                        // `minY` global plutôt que la hauteur : il intègre le
                        // clavier (la barre est décalée par `padding(.bottom,
                        // keyboardHeight)`) et le panneau déplié, sans que le
                        // composer ait à ré-additionner ces termes.
                        .background(
                            GeometryReader { proxy in
                                Color.clear
                                    .onAppear { onControlsTopYChange?(proxy.frame(in: .global).minY) }
                                    .adaptiveOnChange(of: proxy.frame(in: .global).minY) { _, y in
                                        onControlsTopYChange?(y)
                                    }
                            }
                        )
                }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.85),
                       value: viewModel.textEditingMode)
            .onDisappear { onControlsTopYChange?(.greatestFiniteMagnitude) }
        }
    }

    /// Surface transparente qui referme le panneau déplié au moindre toucher
    /// hors de lui. Montée SOUS les contrôles dans le `ZStack` : les bulles,
    /// le panneau et « Terminé » reçoivent donc leurs touches en premier, et
    /// seul ce qui les manque atterrit ici.
    ///
    /// N'existe que panneau ouvert — au repos, elle intercepterait les gestes
    /// du canvas (déplacement du texte, pinch, tap sur un autre élément).
    private var dismissCatcher: some View {
        Color.clear
            .contentShape(Rectangle())
            .ignoresSafeArea()
            .onTapGesture { viewModel.setExpandedTool(nil) }
            .accessibilityHidden(true)
    }

    /// Plus de bandeau pleine largeur derrière les contrôleurs : les bulles
    /// flottent NUES sur le canvas, comme les FABs et les actions du header
    /// (directive user 2026-07-10 « icônes flottantes sans arrière-plan »).
    /// Seul le panneau d'options déplié garde un îlot de verre — il porte du
    /// CONTENU (pastilles, curseurs) qui a besoin d'une surface lisible.
    private func bottomRow(expandedTool: TextEditTool?,
                           binding: Binding<StoryTextObject>) -> some View {
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
                    textObject: binding,
                    expandedTool: expandedTool,
                    onOpenPanel: { tool in
                        viewModel.setExpandedTool(expandedTool == tool ? nil : tool)
                    }
                )
            }
            .padding(.horizontal, TextEditToolbarMetrics.horizontalMargin)
            .padding(.vertical, 12)
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
