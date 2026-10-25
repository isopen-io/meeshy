package me.meeshy.sdk.model.chrome

/**
 * Quand les deux boutons flottants (et leur echelle) sont montes — miroir de
 * `RootView.floatingChrome` iOS : `!router.isDeepRoute && reels == nil && !onboarding`.
 *
 * Masques sur toute route PROFONDE (un fil, un profil, un reglage secondaire), pendant les
 * Reels et pendant l'onboarding, qui recouvre le chrome. [rootRoutes] est l'ensemble des
 * destinations de premier niveau, fourni par l'app : la loi reste pure.
 */
public object RootChromeVisibility {
    public fun showsFloatingChrome(
        currentRoute: String?,
        rootRoutes: Set<String>,
        isReelsPresented: Boolean = false,
        isOnboardingPresented: Boolean = false,
    ): Boolean {
        if (isReelsPresented || isOnboardingPresented) return false
        return currentRoute != null && currentRoute in rootRoutes
    }
}
