package me.meeshy.sdk.model.rootnav

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RootCoverageTest {

    @Test
    fun `le bandeau de lien en attente ne se montre que sur la connexion`() {
        assertThat(RootCoverage.showsPendingLinkNotice(RootRoute.LOGIN, true)).isTrue()
        assertThat(RootCoverage.showsPendingLinkNotice(RootRoute.LOGIN, false)).isFalse()
        assertThat(RootCoverage.showsPendingLinkNotice(RootRoute.CONNECTED, true)).isFalse()
        assertThat(RootCoverage.showsPendingLinkNotice(RootRoute.NONE, true)).isFalse()
    }

    @Test
    fun `la session non resolue mais sans restauration en vol est verifiee`() {
        assertThat(RootCoverage.hasCheckedSession(hasResolvedStoredSession = false, isRestoringSession = true)).isFalse()
        assertThat(RootCoverage.hasCheckedSession(hasResolvedStoredSession = false, isRestoringSession = false)).isTrue()
        assertThat(RootCoverage.hasCheckedSession(hasResolvedStoredSession = true, isRestoringSession = true)).isTrue()
    }

    @Test
    fun `route de connexion seulement apres verification et hors changement de compte`() {
        val route = RootPresentationRules.route(
            isAuthenticated = false,
            isSwitchingAccount = false,
            hasCheckedSession = RootCoverage.hasCheckedSession(false, true),
            previewReplacesLogin = false,
        )
        assertThat(route).isEqualTo(RootRoute.NONE)
    }
}
