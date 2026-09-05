import SwiftUI
import MeeshyUI

/// **La palette de réactions d'un POST ou d'un RÉEL** — décision porteur du
/// 2026-09-02, « la palette d'emoji partout, comme sur les stories ».
///
/// Le serveur acceptait n'importe quel émoji depuis toujours
/// (`addPostReaction(postId:emoji:)`). Quatre surfaces en faisaient trois
/// choses : message et story ouvraient la palette, le post et le réel
/// envoyaient **❤️ en dur** — et l'empruntaient à `StoryViewerView.heartEmoji`,
/// la constante d'une troisième surface (#4916).
///
/// Ce composant porte l'ÉTAT et le GESTE, pas la mise en page : l'hôte décide
/// où la rangée se pose, parce qu'un rail de réel et une barre d'actions de
/// post n'ont pas la même géographie. Ce qu'il garantit est ce qui doit être
/// identique — les mêmes émojis, dans le même ordre, sous le même geste.
///
/// **Le geste bref reste le cœur.** Un appui simple envoie ❤️ comme avant :
/// la palette s'ouvre sur un appui LONG, en second. Rendre la palette
/// obligatoire coûterait un geste à l'usage nominal (loi 7 — chemin nominal
/// ≤ 2 gestes), pour une action que la majorité fait d'un pouce.
struct PostReactionPalette: View {

    /// Ouvert par l'hôte sur appui long ; refermé par la palette elle-même.
    @Binding var isPresented: Bool

    /// L'émoji choisi. L'hôte l'envoie — ce composant ne parle à aucun service :
    /// le post passe par son ViewModel, le réel par le sien, et aucun des deux
    /// n'a la même réconciliation optimiste.
    let onPick: (String) -> Void

    var style: EmojiReactionPicker.Style = .dark

    var body: some View {
        if isPresented {
            EmojiReactionPicker(
                quickEmojis: MeeshyQuickReactions.standard,
                style: style,
                onReact: { emoji in
                    HapticFeedback.light()
                    onPick(emoji)
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        isPresented = false
                    }
                },
                onDismiss: {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        isPresented = false
                    }
                }
            )
            .transition(.scale(scale: 0.85, anchor: .trailing).combined(with: .opacity))
        }
    }
}
