package me.meeshy.sdk.model.rootnav

/** L'ecran que la racine montre : connecte, connexion, ou RIEN (jamais un ecran de connexion qui clignote). */
enum class RootRoute { CONNECTED, LOGIN, NONE }

/** Les trois temps du rideau de demarrage : il couvre, il se leve (fondu), il a disparu. */
enum class SplashPhase { COVERING, REVEALING, GONE }

/** Une session invitee posee par un lien ; [isDeliberate] = choisie par l'utilisateur, pas subie. */
data class RootGuestSession(val isDeliberate: Boolean)

/**
 * Loi pure de presentation de la racine. Miroir de iOS `RootPresentationRules`
 * (`apps/ios/Meeshy/App/RootPresentationRules.swift`) : aucune vue ne reecrit ces conjonctions.
 */
object RootPresentationRules {

    /**
     * `CONNECTED` des qu'une session existe. `LOGIN` seulement une fois la session stockee
     * VERIFIEE, hors apercu de design et hors changement de compte ; `NONE` sinon, pour que
     * l'ecran de connexion ne clignote pas pendant la verification.
     */
    fun route(
        isAuthenticated: Boolean,
        isSwitchingAccount: Boolean,
        hasCheckedSession: Boolean,
        previewReplacesLogin: Boolean,
    ): RootRoute = when {
        isAuthenticated -> RootRoute.CONNECTED
        !hasCheckedSession || previewReplacesLogin || isSwitchingAccount -> RootRoute.NONE
        else -> RootRoute.LOGIN
    }

    /** Un accident (session invitee non voulue) est refuse une fois connecte ; un choix delibere reste couvert. */
    fun showsGuestCover(guest: RootGuestSession?, isAuthenticated: Boolean): Boolean =
        guest != null && (!isAuthenticated || guest.isDeliberate)

    fun visitorContentIsEligible(isAuthenticated: Boolean, hasGuestSession: Boolean, splashPhase: SplashPhase): Boolean =
        !isAuthenticated && !hasGuestSession && splashPhase != SplashPhase.COVERING

    fun showsOnboarding(
        hasCompletedOnboarding: Boolean,
        isAuthenticated: Boolean,
        splashPhase: SplashPhase,
        hasGuestSession: Boolean,
        hasVisitorRequest: Boolean,
    ): Boolean = !hasCompletedOnboarding &&
        !isAuthenticated &&
        splashPhase != SplashPhase.COVERING &&
        !hasGuestSession &&
        !hasVisitorRequest

    fun showsCelebration(isAuthenticated: Boolean, isShowing: Boolean): Boolean = isAuthenticated && isShowing

    /** Le contenu reste dans l'arbre mais a opacite 0 tant que le rideau couvre. */
    fun contentAlpha(splashPhase: SplashPhase): Float = if (splashPhase == SplashPhase.COVERING) 0f else 1f
}
