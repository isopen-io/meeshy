import SwiftUI

// MARK: - Répondre à un commentaire le GARDE en vue (#8644)
//
// Demande porteur du 2026-09-29 : « Cacher les éléments inutiles pendant une
// opération tout en gardant en vue ce qui peut lui être utile. »
//
// Toucher « Répondre » sous un commentaire pose la cible et ouvre le clavier —
// et c'est tout. Un commentaire de la moitié basse de la liste passait alors
// SOUS le clavier : on écrivait une réponse à un texte qu'on ne voyait plus, la
// bannière n'en montrant qu'une ligne. La feuille de commentaires et le détail
// d'un post avaient le même défaut, parce qu'ils ont le même geste.

/// **Où ramener la liste quand une réponse commence — la règle, sans vue.**
nonisolated enum CommentReplyFocus {

    /// Le temps que le clavier monte et que la liste se rétrécisse : défiler
    /// avant, c'est viser une rangée qui bougera encore.
    static let keyboardSettleDelay: TimeInterval = 0.35

    /// L'identifiant de rangée que les deux hôtes posent (`comment-<id>`), pour
    /// un commentaire racine comme pour une réponse dépliée. `nil` : la réponse
    /// se referme, rien ne défile.
    static func scrollTarget(replyingToId: String?) -> String? {
        guard let id = replyingToId, !id.isEmpty else { return nil }
        return "comment-\(id)"
    }

    /// Le bas de la zone visible — juste au-dessus du composeur : la cible est
    /// lue en écrivant, et ce qui la précède reste au-dessus d'elle.
    static let anchor: UnitPoint = .bottom
}

private struct KeepsReplyTargetInView: ViewModifier {
    let replyingToId: String?
    let proxy: ScrollViewProxy
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.adaptiveOnChange(of: replyingToId) { _, id in
            guard let target = CommentReplyFocus.scrollTarget(replyingToId: id) else { return }
            let animation: Animation? = reduceMotion ? nil : .easeInOut(duration: 0.3)
            DispatchQueue.main.asyncAfter(deadline: .now() + CommentReplyFocus.keyboardSettleDelay) {
                withAnimation(animation) { proxy.scrollTo(target, anchor: CommentReplyFocus.anchor) }
            }
        }
    }
}

extension View {

    /// Ramène le commentaire auquel on répond juste au-dessus du composeur,
    /// une fois le clavier monté (#8644).
    func keepsReplyTargetInView(_ replyingToId: String?, proxy: ScrollViewProxy) -> some View {
        modifier(KeepsReplyTargetInView(replyingToId: replyingToId, proxy: proxy))
    }
}
