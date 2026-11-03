package me.meeshy.sdk.model.net

/**
 * Un segment de chemin STRICT (miroir de `GamePathSegment`, iOS, #9378) : seuls passent `A-Za-z0-9-_~` — ni `/`, ni `?`,
 * ni `#`, ni `.`, donc ni `..` ni segment encodé (`%2F`). Un identifiant venu d'une charge serveur et interpolé tel
 * quel dans un chemin d'écriture pourrait sinon rediriger la requête vers une AUTRE route.
 */
public object PathSegment {

    public fun isStrict(segment: String): Boolean = segment.isNotEmpty() && segment.all(::isUnreserved)

    private fun isUnreserved(c: Char): Boolean =
        c in 'A'..'Z' || c in 'a'..'z' || c in '0'..'9' || c == '-' || c == '_' || c == '~'

    /** Les routes du jeu portent des identifiants serveur : chacun de leurs segments doit être strict. */
    public fun isGameRoute(route: String): Boolean {
        val parts = route.split('/')
        return route.startsWith("/me/game/") || (parts.size >= 4 && parts[1] == "users" && parts[3] == "game")
    }

    /** Vrai quand [path] (avec ou sans préfixe d'API) vise une route du jeu et qu'un de ses segments sort du jeu strict. */
    public fun hasForbiddenGameSegment(path: String): Boolean {
        val route = EndpointPolicy.routeOf(path)
        return isGameRoute(route) && route.split('/').drop(1).any { !isStrict(it) }
    }
}
