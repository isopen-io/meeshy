package me.meeshy.sdk.model.net

/** Ce qu'une requête attache, et ce qu'un 401 y signifie. */
public enum class EndpointAuthKind {
    /** Jeton de session attaché ; un 401 déclenche le rafraîchissement. */
    BEARER,

    /** Aucune authentification : la route SERT à obtenir un jeton. */
    NONE,

    /** Aucun jeton ; un 401 est un refus d'IDENTIFIANTS, jamais une session expirée. */
    CREDENTIALS,
}

/** Ce qui se réessaie sur erreur transitoire. */
public enum class EndpointRetryPolicy { STANDARD, NEVER }

/** Ce qu'un refus 4xx rend : une phrase ([OPAQUE]) ou un refus typé ([STRUCTURED]). */
public enum class EndpointRejectionPolicy { OPAQUE, STRUCTURED }

/** Les trois politiques d'une route, lues ensemble. */
public data class RoutePolicy(
    val authKind: EndpointAuthKind,
    val retryPolicy: EndpointRetryPolicy,
    val rejectionPolicy: EndpointRejectionPolicy,
)

/**
 * La TABLE de politique par route — miroir de `MeeshyEndpointPolicy` (iOS,
 * `MeeshyEndpointPolicy.swift`). Elle nomme trois décisions de produit qui vivaient
 * en comparaisons de préfixe dispersées : un préfixe qui bouge cesse de matcher en
 * silence, une table nommée a un témoin.
 *
 * Les chemins se lisent SANS le préfixe d'API ([API_PREFIX]) ; [of] le retire.
 */
public object EndpointPolicy {

    public const val API_PREFIX: String = "/api/v1"

    private val DEFAULT = RoutePolicy(
        EndpointAuthKind.BEARER,
        EndpointRetryPolicy.STANDARD,
        EndpointRejectionPolicy.OPAQUE,
    )

    public fun of(path: String): RoutePolicy {
        val route = routeOf(path)
        return RoutePolicy(authKind(route), retryPolicy(route), rejectionPolicy(route))
    }

    public fun routeOf(path: String): String =
        if (path == API_PREFIX || path.startsWith("$API_PREFIX/")) path.removePrefix(API_PREFIX) else path

    /**
     * Connexion et attente de preuve = identifiants. Rafraîchissement, inscription et
     * lien magique SERVENT à obtenir un jeton : en demander un bouclerait. Seule la
     * connexion fait d'un 401 un refus d'identifiants — inscription et lien magique
     * rendent tout en 400.
     */
    private fun authKind(route: String): EndpointAuthKind = when {
        route.startsWith("/auth/login") || route == "/auth/verification/status" -> EndpointAuthKind.CREDENTIALS
        route == "/auth/refresh" ||
            route.startsWith("/auth/register") ||
            route.startsWith("/auth/magic-link") ||
            isPublicAffiliate(route) -> EndpointAuthKind.NONE
        else -> DEFAULT.authKind
    }

    /**
     * Les quatre routes PUBLIQUES du parrainage — servies avant toute inscription, donc sans jeton :
     * clic, visite, validation d'un jeton et métadonnées Open Graph. Les quatre autres exigent la session.
     */
    private fun isPublicAffiliate(route: String): Boolean =
        route.startsWith("/affiliate/click/") ||
            route == "/affiliate/track-visit" ||
            route.startsWith("/affiliate/validate/") ||
            (route.startsWith("/affiliate/") && route.endsWith("/og"))

    /**
     * Le 503 du Signal Protocol annonce un état PERMANENT, jamais une surcharge
     * passagère : réessayer brûle la temporisation sans pouvoir aboutir.
     */
    private fun retryPolicy(route: String): EndpointRetryPolicy =
        if (route.startsWith("/signal/")) EndpointRetryPolicy.NEVER else EndpointRetryPolicy.STANDARD

    /** L'inscription, la preuve d'adresse et la réinitialisation documentent leurs codes. */
    private fun rejectionPolicy(route: String): EndpointRejectionPolicy =
        if (route.startsWith("/auth/register") || route == "/auth/verify-email" || route == "/auth/reset-password") {
            EndpointRejectionPolicy.STRUCTURED
        } else {
            EndpointRejectionPolicy.OPAQUE
        }

    /** Vrai pour un chemin à segment vide, double slash ou slash final (`/` seul excepté). */
    public fun hasEmptyPathSegment(path: String): Boolean =
        path.length > 1 && (path.contains("//") || path.endsWith("/"))
}
