import Foundation
import MeeshySDK

/// **La bascule optimiste d'un favori, en UN site** (#15994).
///
/// Les RÉSULTATS D'UN HASHTAG possèdent leurs `FeedPost` en propre, comme les
/// favoris pour le repartage (`PostRepostMutation`) : la carte elle-même porte
/// l'état optimiste. La RÈGLE ne diffère pas d'une liste à l'autre — le drapeau
/// et le compteur bougent ensemble, le compteur ne descend jamais sous zéro, et
/// rien d'autre de la carte ne change.
///
/// `setting` est idempotente : un retour arrière qui arrive sur une carte déjà
/// revenue (rechargement pendant l'aller-retour réseau) ne déplace pas le
/// compteur une seconde fois.
nonisolated enum PostBookmarkMutation {

    static func setting(_ post: FeedPost, bookmarked: Bool) -> FeedPost {
        guard post.isBookmarkedByMe != bookmarked else { return post }
        var next = post
        next.isBookmarkedByMe = bookmarked
        next.bookmarkCount = max(0, post.bookmarkCount + (bookmarked ? 1 : -1))
        return next
    }
}
