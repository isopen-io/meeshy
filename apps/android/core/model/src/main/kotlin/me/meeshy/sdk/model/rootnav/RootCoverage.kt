package me.meeshy.sdk.model.rootnav

/**
 * Lois pures de la racine consommées par [me.meeshy.app.navigation.RootSessionViewModel] : le bandeau « lien en
 * attente » et la vérification de la session stockée. Les couvertures (invité, visiteur, accueil) et les toasts
 * sont gouvernés par leurs hôtes Compose et leur ordre z dans `MeeshyApp`.
 */
object RootCoverage {

    /** Le bandeau « lien en attente » n'existe que sur la connexion, quand un lien a besoin d'un compte. */
    fun showsPendingLinkNotice(route: RootRoute, linkOpensAfterSignIn: Boolean): Boolean =
        route == RootRoute.LOGIN && linkOpensAfterSignIn

    /** La session est verifiee quand elle est resolue OU qu'aucune restauration n'est plus en vol. */
    fun hasCheckedSession(hasResolvedStoredSession: Boolean, isRestoringSession: Boolean): Boolean =
        hasResolvedStoredSession || !isRestoringSession
}
