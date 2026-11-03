package me.meeshy.sdk.model.rootnav

/** Ce qui recouvre la racine, du plus prioritaire au moins prioritaire ; [NONE] = la route (connexion ou app) se voit. */
enum class RootCover { GUEST, VISITOR, ONBOARDING, NONE }

/**
 * Loi pure des couvertures de la racine : invite > visiteur > accueil > (connexion). Miroir de l'ordre de
 * `RootScene` / `RootPresentationRules` (iOS). Les toasts de retour ne sont PAS une couverture : ils restent
 * toujours au sommet, y compris au-dessus de celles-ci ([toastsStayOnTop]).
 */
object RootCoverage {

    fun cover(guestCover: Boolean, visitorCover: Boolean, onboardingCover: Boolean): RootCover = when {
        guestCover -> RootCover.GUEST
        visitorCover -> RootCover.VISITOR
        onboardingCover -> RootCover.ONBOARDING
        else -> RootCover.NONE
    }

    /** Le bandeau « lien en attente » n'existe que sur la connexion, quand un lien a besoin d'un compte. */
    fun showsPendingLinkNotice(route: RootRoute, linkOpensAfterSignIn: Boolean): Boolean =
        route == RootRoute.LOGIN && linkOpensAfterSignIn

    /** Tant qu'un changement de compte est en cours, connexion, reprise de compte et ouverture sur preuve sont inertes. */
    fun mayOpenSession(isSwitchingAccount: Boolean): Boolean = !isSwitchingAccount

    /** Aucune couverture, quelle qu'elle soit, ne passe au-dessus d'un toast de retour. */
    @Suppress("UNUSED_PARAMETER")
    fun toastsStayOnTop(cover: RootCover): Boolean = true

    /** Le session est verifiee quand elle est resolue OU qu'aucune restauration n'est plus en vol. */
    fun hasCheckedSession(hasResolvedStoredSession: Boolean, isRestoringSession: Boolean): Boolean =
        hasResolvedStoredSession || !isRestoringSession
}
