import Foundation
import MeeshySDK

/// Le détail d'un post, présenté en FEUILLE (#16676).
///
/// Directive porteur : « la vue détail doit s'afficher en feuille et non
/// plus ouvrir une vue à part ». `.postDetail` reste la route
/// que TOUS les appelants poussent — fil, recherche, notification, lien
/// profond, repost, réel, profil — et c'est le routeur qui la transforme en
/// feuille : aucune porte n'a à le savoir, aucune ne peut l'oublier.
struct PostDetailSheetTarget: Identifiable, Equatable {
    let postId: String
    let initialPost: FeedPost?
    let showComments: Bool
    let commentId: String?
    let parentCommentId: String?

    /// Un autre commentaire visé, c'est une autre feuille : l'identité porte
    /// la cible entière, pour que la feuille se rouvre sur elle.
    var id: String {
        [postId, commentId ?? "", parentCommentId ?? "", showComments ? "comments" : ""].joined(separator: "|")
    }

    init?(_ route: Route) {
        guard case .postDetail(let postId, let initialPost, let showComments, let commentId, let parentCommentId) = route else {
            return nil
        }
        self.postId = postId
        self.initialPost = initialPost
        self.showComments = showComments
        self.commentId = commentId
        self.parentCommentId = parentCommentId
    }
}

/// Une ouverture de conversation que le verrou PIN retient (#11386).
///
/// Elle garde l'ouverture ENTIÈRE — cible du saut, transition, colonne iPad —
/// pour la rejouer telle quelle quand le PIN est donné, et rien n'en est armé
/// avant : un surlignage posé avant le PIN survivrait à un PIN abandonné.
struct LockedConversationOpening: Identifiable {
    let conversation: Conversation
    let open: @MainActor () -> Void

    var id: String { conversation.id }
}
