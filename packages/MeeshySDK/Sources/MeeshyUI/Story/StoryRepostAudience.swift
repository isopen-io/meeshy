import Foundation

/// Miroir iOS de la loi d'audience de la republication : **même audience, ou
/// plus restreinte, JAMAIS plus large** (règle produit, 2026-08-19).
///
/// # Ce type n'est PAS la garantie
///
/// La loi AUTORITAIRE vit côté serveur — `packages/shared/utils/repost-audience.ts`,
/// appliquée dans `PostService.repostPost` avec un 403
/// `REPOST_AUDIENCE_WIDENING`. C'est là qu'est la frontière de sécurité : un
/// client modifié pourrait sinon republier une story `PRIVATE` en `PUBLIC`.
///
/// Ce miroir sert UNIQUEMENT à plafonner le sélecteur d'audience du composeur,
/// pour que l'utilisateur ne se voie jamais proposer un choix que le serveur
/// refusera. Les deux DOIVENT dire la même chose ; leurs témoins sont jumeaux
/// (`StoryRepostAudienceTests` ⇄ `repost-audience.test.ts`). Toute évolution
/// de la règle touche les DEUX sites.
///
/// # Pourquoi ce n'est pas un rang numérique
///
/// Les six audiences ne forment pas un ordre total. `COMMUNITY` et `FRIENDS`
/// sont incomparables — un contact peut ne pas être membre de la communauté,
/// et un membre peut ne pas être un contact ; basculer de l'une à l'autre
/// EXPOSE le contenu à des gens qui ne le voyaient pas. Idem `ONLY` face à
/// `FRIENDS`. Un rang autoriserait donc des élargissements réels ayant l'air
/// de réductions.
///
/// Trois relations seulement sont sûres sans connaître les listes ni les
/// appartenances : l'identité, `PRIVATE` (l'auteur seul, sous-ensemble de
/// tout), et « depuis `PUBLIC` » (tout le monde contient toute audience). La
/// table s'en déduit — volontairement conservatrice.
/// # `nonisolated` — obligatoire, pas décoratif
///
/// Le package déclare `.defaultIsolation(MainActor.self)` (SE-0466) : sans ce
/// mot-clé, chaque méthode de cette loi hériterait de `@MainActor` et
/// deviendrait inappelable depuis un contexte synchrone non isolé. Constaté
/// immédiatement — les témoins XCTest ne compilaient plus (« call to main
/// actor-isolated static method in a synchronous nonisolated context »). Une
/// loi pure, sans état ni UI, n'a aucune raison de vivre sur le main actor.
/// Même traitement que `LentilleFeatureFlag` et `NowPlayingArtwork`.
public nonisolated enum StoryRepostAudience {

    /// Énumérées explicitement plutôt que via `PostVisibility.allCases` : la
    /// conformance `CaseIterable` est synthétisée sur un type dont l'isolation
    /// par défaut est `@MainActor`, donc `allCases` n'est pas lisible depuis ce
    /// contexte `nonisolated`.
    private static let everyAudience: [PostVisibility] =
        [.public, .community, .friends, .except, .only, .private]

    /// Audiences qu'un republieur peut choisir, l'original étant donné.
    public static func allowed(from original: PostVisibility) -> [PostVisibility] {
        switch original {
        case .public:
            return everyAudience
        case .private:
            return [.private]
        case .community, .friends, .except, .only:
            return [original, .private]
        }
    }

    /// Variante tolérante pour les appelants qui ne tiennent la visibilité
    /// qu'en `String` (`MeeshyStory.visibility` est optionnel).
    ///
    /// Une valeur absente ou inconnue retombe sur `PRIVATE` — le cas le plus
    /// RESTRICTIF. Retomber sur `PUBLIC` « parce que c'est le défaut du
    /// backend » ouvrirait grand sur une donnée qu'on n'a pas su lire : même
    /// prudence que `MeeshyStory.isPublic`, qui vaut `false` quand la
    /// visibilité est `nil`.
    public static func allowed(fromRawValue raw: String?) -> [PostVisibility] {
        guard let raw, let original = PostVisibility(rawValue: raw.uppercased()) else {
            return [.private]
        }
        return allowed(from: original)
    }

    /// Vue booléenne de la même loi — un seul comportement, deux lectures.
    public static func isAllowed(_ requested: PostVisibility, from original: PostVisibility) -> Bool {
        allowed(from: original).contains(requested)
    }

    /// `EXCEPT`/`ONLY` ne se lisent pas seules : leur portée EST la liste
    /// d'utilisateurs qui les accompagne. Laisser le republieur composer SA
    /// liste rouvrirait l'élargissement par la porte de service — « même
    /// audience » avec une liste `ONLY` plus longue est plus LARGE. Pour ces
    /// deux audiences, la liste se lit sur l'original.
    ///
    /// Le serveur applique la même règle indépendamment
    /// (`repostVisibilityInheritsAudienceList`).
    public static func inheritsAudienceList(_ visibility: PostVisibility) -> Bool {
        visibility == .except || visibility == .only
    }
}
