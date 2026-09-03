import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La palette de réactions du détail d'un post, hors du god object.**
///
/// `PostDetailView.swift` est hors budget (directive : 1000–1200 lignes) et la
/// règle est explicite — *ajouter à un fichier déjà hors budget est interdit,
/// on extrait d'abord*. J'y avais ajouté sans extraire : le cliquet de dette a
/// mordu sur `main`, à juste titre.
///
/// Ce qui vit ici est ce que la palette ajoute à l'écran : le geste qui
/// l'ouvre, l'action VoiceOver équivalente, son placement, et l'envoi de
/// l'émoji choisi. Le détail garde ce qui le concerne — le cœur, son compteur
/// et sa réconciliation optimiste.
extension PostDetailView {

    /// **Poser un émoji AUTRE que le cœur.** Le cœur garde
    /// `toggleDetailPostHeart` : lui seul porte `detailIsLiked`, le compteur
    /// affiché et sa réconciliation. Un émoji quelconque n'a pas d'état à
    /// peindre dans cette barre — le geste est donc ADDITIF, jamais un
    /// basculement, pour ne pas promettre un état que la vue ne sait pas
    /// afficher.
    func sendDetailReaction(_ emoji: String) {
        guard emoji != MeeshyQuickReactions.heart else {
            toggleDetailPostHeart()
            return
        }
        Task {
            _ = try? await SocialSocketManager.shared.addPostReaction(
                postId: postId, emoji: emoji)
        }
    }
}
