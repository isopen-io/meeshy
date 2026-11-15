import Foundation

/// **La bascule optimiste d'un like, en UN site.**
///
/// Cinq surfaces posent un like sur un `FeedPost` — le fil, le détail, le reel
/// viewer, le profil, et désormais les favoris et les résultats d'un hashtag.
/// Chacune a son orchestration légitime (file d'attente hors-ligne pour le fil,
/// REST direct ailleurs, overrides pour le profil) ; ce qui n'a AUCUNE raison de
/// différer, c'est la RÈGLE : dans quel état la carte bascule, et de combien son
/// compteur bouge.
///
/// Ce que la duplication avait déjà produit, mesuré avant extraction :
/// `ProfileUserPostsList` calcule son compteur par un `adjusted(base, flag,
/// override)` privé, `FeedViewModel` par un `+= isLiked ? 1 : -1` sans borne
/// basse. Un compteur serveur à 0 réaffiché après un retrait tardif passait donc
/// à −1 sur le second chemin et restait à 0 sur le premier. Le bornage n'est pas
/// une précaution décorative : `likes` est un `Int` signé, et le serveur peut
/// très bien avoir déjà décrémenté avant que le geste optimiste ne s'applique.
///
/// La loi est PURE et `nonisolated` : elle ne lit aucun singleton, ne connaît ni
/// réseau ni cache, et se teste sans simulateur. L'orchestration — appeler le
/// service, restaurer l'instantané, sauver le cache — reste chez chaque
/// ViewModel, qui seul sait ce qu'il possède.
nonisolated enum PostLikeMutation {

    /// L'état de la carte APRÈS la bascule. Un couple, jamais deux valeurs
    /// rendues séparément : un appelant qui applique l'un sans l'autre affiche
    /// un cœur plein au-dessus d'un compteur inchangé, et c'est exactement le
    /// symptôme « le like n'est pas synchronisé » vu de l'utilisateur.
    struct Outcome: Equatable {
        let isLiked: Bool
        let likes: Int
    }

    /// Bascule l'état et déplace le compteur d'une unité dans le sens du geste.
    ///
    /// Le compteur est borné à 0 par le BAS uniquement : un retrait sur un
    /// compteur déjà nul ne fabrique pas de valeur négative, et aucune borne
    /// haute n'a de sens — le total appartient au serveur, qui le réaffirmera
    /// en valeur ABSOLUE par `post:liked` / `post:unliked`.
    static func toggled(isLiked: Bool, likes: Int) -> Outcome {
        let nowLiked = !isLiked
        return Outcome(isLiked: nowLiked, likes: max(0, likes + (nowLiked ? 1 : -1)))
    }
}
