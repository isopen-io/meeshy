import SwiftUI
import MeeshyUI

// MARK: - Le repli d'un espace commentaire (#9122)
//
// Directive porteur 2026-10-02 : dans TOUT espace commentaire, la barre affiche
// ⌄ par défaut ; le toucher la replie en une icône de commentaire (brouillon
// conservé) ; toucher l'icône la rouvre. Le lecteur de story le fait déjà
// (#8431, #8642) ; les commentaires du fil et du détail d'un post montent ce
// modificateur, sous la MÊME loi (`StoryComposerFold`).

private struct ComposerFoldControlKey: EnvironmentKey {
    static let defaultValue: ComposerFoldControl? = nil
}

extension EnvironmentValues {
    /// Le ⌄ qu'un hôte confie à la barre sans passer par son initialiseur.
    var composerFoldControl: ComposerFoldControl? {
        get { self[ComposerFoldControlKey.self] }
        set { self[ComposerFoldControlKey.self] = newValue }
    }
}

extension View {
    /// Rend la barre de commentaire repliable. Une réponse en cours la rouvre :
    /// sa bannière « Réponse à X » vit dedans.
    func foldableComment(isReplying: Bool) -> some View {
        modifier(CommentComposerFoldModifier(isReplying: isReplying))
    }
}

/// **Replié, la barre reste MONTÉE** — à hauteur nulle et invisible : le texte,
/// les pièces jointes et la prise vocale vivent dans ses `@State` et dans
/// l'hôte. La démonter jetterait le brouillon.
struct CommentComposerFoldModifier: ViewModifier {
    let isReplying: Bool
    @State private var userFolded = false

    func body(content: Content) -> some View {
        let isFolded = StoryComposerFold.presentation(userFolded: userFolded, isReplying: isReplying) == .folded
        VStack(spacing: 0) {
            if isFolded {
                unfoldButton
                    .padding(.vertical, MeeshySpacing.sm)
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
            }
            content
                .environment(\.composerFoldControl, foldControl(isFolded: isFolded))
                .frame(height: isFolded ? 0 : nil, alignment: .top)
                .clipped()
                .opacity(isFolded ? 0 : 1)
                .allowsHitTesting(!isFolded)
                .accessibilityHidden(isFolded)
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.82), value: isFolded)
    }

    private func foldControl(isFolded: Bool) -> ComposerFoldControl? {
        guard StoryComposerFold.offersFoldButton(presentation: isFolded ? .folded : .expanded) else { return nil }
        return ComposerFoldControl(
            symbol: StoryComposerFold.foldSymbol,
            label: String(localized: "story.composer.fold",
                          defaultValue: "Masquer la zone de commentaire", bundle: .main),
            action: fold)
    }

    private func fold() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        HapticFeedback.light()
        withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) { userFolded = true }
    }

    private func unfold() {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) { userFolded = false }
    }

    private var unfoldButton: some View {
        Button(action: unfold) {
            Image(systemName: StoryComposerFold.unfoldSymbol)
                .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .semibold))
                .foregroundStyle(.primary)
                .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                .adaptiveLiquidGlass(in: Circle(), interactive: true)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .accessibilityLabel(String(localized: "story.composer.unfold",
                                   defaultValue: "Afficher la zone de commentaire", bundle: .main))
    }
}
