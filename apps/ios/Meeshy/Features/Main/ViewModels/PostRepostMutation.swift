import Foundation
import MeeshySDK

/// **La bascule optimiste d'un repartage, en UN site** (#15934).
///
/// Les FAVORIS et les RÉSULTATS D'UN HASHTAG offraient « Repartager » sans
/// action : le choix appelait un rappel absent, et le toucher ne faisait rien.
/// Ces deux listes possèdent leurs `FeedPost` en propre — ni surcharges comme
/// le profil, ni état d'engagement comme le fil — si bien que la carte elle-
/// même porte l'état optimiste. Ce qui n'a AUCUNE raison de différer entre
/// elles, c'est la RÈGLE : quand la carte bascule, de combien son compteur
/// bouge, ce qui part sur le fil, et comment on revient en arrière.
///
/// La loi est PURE et `nonisolated`, comme `PostLikeMutation` : l'envoi
/// (`RepostPublisher`, son verrou en vol et sa file hors ligne), le toast et le
/// cache restent chez chaque modèle, qui seul sait ce qu'il possède.
nonisolated enum PostRepostMutation {

    /// La carte APRÈS le repartage — `nil` quand elle est déjà repartagée :
    /// le repartage est append-only côté serveur (aucun « dé-repartage »), un
    /// second toucher n'a donc rien à envoyer.
    static func reposted(_ post: FeedPost) -> FeedPost? {
        guard !post.isRepostedByMe else { return nil }
        var next = post
        next.isRepostedByMe = true
        next.repostCount = max(0, post.repostCount) + 1
        return next
    }

    /// Le retour arrière d'un repartage qui a échoué. Il ne touche QUE l'état
    /// du repartage : restaurer l'instantané entier effacerait un like posé
    /// pendant l'aller-retour réseau.
    static func withdrawn(_ post: FeedPost) -> FeedPost {
        var previous = post
        previous.isRepostedByMe = false
        previous.repostCount = max(0, post.repostCount - 1)
        return previous
    }

    /// Ce qui part : la RACINE de la chaîne au FORMAT de la carte
    /// (`RepostTargeting`), l'audience héritée de l'original — ces listes
    /// n'offrent aucun sélecteur d'audience, comme le fil.
    static func intent(for post: FeedPost) -> RepostIntent {
        let target = RepostTargeting.target(
            cardId: post.id, cardType: post.type,
            repostOfId: post.repost?.id, originalRepostOfId: post.repost?.originalRepostOfId
        )
        return .simple(postId: target.postId, targetType: target.targetType, visibility: nil)
    }
}
