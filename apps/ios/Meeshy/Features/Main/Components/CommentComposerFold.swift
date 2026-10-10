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

    /// Rend la barre d'une CONVERSATION repliable (#9955, directive porteur
    /// 2026-10-10) — le MÊME repli que la story et les commentaires. Le ⌄
    /// s'efface pendant qu'on écrit ou qu'on enregistre (`isComposing`), et
    /// une saisie qui commence rouvre la barre (une réponse, une édition qui
    /// demandent le focus). Une réponse en cours ne force PAS l'ouverture :
    /// elle survit au repli, comme le brouillon et les pièces jointes.
    func foldableConversationComposer(isComposing: Bool, onFold: @escaping () -> Void) -> some View {
        modifier(CommentComposerFoldModifier(
            isReplying: false,
            isComposing: isComposing,
            wording: .conversation,
            onFold: onFold))
    }
}

/// **Quand la barre d'une conversation offre son ⌄** (#9955) : la loi de la
/// story (#8431, #9122 — déplié ⇒ ⌄), moins les instants où l'on compose.
nonisolated enum ConversationComposerFold {
    static func isComposing(isFocused: Bool, isRecording: Bool) -> Bool {
        isFocused || isRecording
    }

    static func offersFoldButton(presentation: StoryComposerFold.Presentation, isComposing: Bool) -> Bool {
        StoryComposerFold.offersFoldButton(presentation: presentation) && !isComposing
    }

    /// Une saisie qui commence sur une barre repliée la rouvre.
    static func reopens(userFolded: Bool, isComposing: Bool) -> Bool {
        userFolded && isComposing
    }
}

/// Les deux libellés VoiceOver d'un repli : ceux d'un espace commentaire, ou
/// ceux de la barre d'une conversation (#9955).
struct ComposerFoldWording {
    let fold: String
    let unfold: String

    static var comment: ComposerFoldWording {
        ComposerFoldWording(
            fold: String(localized: "story.composer.fold",
                         defaultValue: "Masquer la zone de commentaire", bundle: .main),
            unfold: String(localized: "story.composer.unfold",
                           defaultValue: "Afficher la zone de commentaire", bundle: .main))
    }

    static var conversation: ComposerFoldWording {
        ComposerFoldWording(
            fold: String(localized: "conversation.composer.fold",
                         defaultValue: "Réduire la barre de message", bundle: .main),
            unfold: String(localized: "conversation.composer.unfold",
                           defaultValue: "Afficher la barre de message", bundle: .main))
    }
}

/// **Replié, la barre reste MONTÉE** — à hauteur nulle et invisible : le texte,
/// les pièces jointes et la prise vocale vivent dans ses `@State` et dans
/// l'hôte. La démonter jetterait le brouillon.
struct CommentComposerFoldModifier: ViewModifier {
    let isReplying: Bool
    /// On écrit ou on enregistre : le ⌄ s'efface (#9955). Toujours `false`
    /// dans un espace commentaire, dont le ⌄ reste visible clavier levé.
    var isComposing: Bool = false
    var wording: ComposerFoldWording = .comment
    var onFold: (() -> Void)? = nil
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
        .adaptiveOnChange(of: isComposing) { _, composing in
            guard ConversationComposerFold.reopens(userFolded: userFolded, isComposing: composing) else { return }
            withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) { userFolded = false }
        }
    }

    private func foldControl(isFolded: Bool) -> ComposerFoldControl? {
        guard ConversationComposerFold.offersFoldButton(presentation: isFolded ? .folded : .expanded,
                                                        isComposing: isComposing) else { return nil }
        return ComposerFoldControl(
            symbol: StoryComposerFold.foldSymbol,
            label: wording.fold,
            action: fold)
    }

    private func fold() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        HapticFeedback.light()
        onFold?()
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
        .accessibilityLabel(wording.unfold)
    }
}
