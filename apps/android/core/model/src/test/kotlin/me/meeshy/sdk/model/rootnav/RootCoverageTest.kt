package me.meeshy.sdk.model.rootnav

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RootCoverageTest {

    private val flags = listOf(true, false)

    @Test
    fun `table de verite des couvertures invite puis visiteur puis accueil`() {
        for (g in flags) for (v in flags) for (o in flags) {
            val expected = when {
                g -> RootCover.GUEST
                v -> RootCover.VISITOR
                o -> RootCover.ONBOARDING
                else -> RootCover.NONE
            }
            assertThat(RootCoverage.cover(g, v, o)).isEqualTo(expected)
        }
    }

    @Test
    fun `le bandeau de lien en attente ne se montre que sur la connexion`() {
        assertThat(RootCoverage.showsPendingLinkNotice(RootRoute.LOGIN, true)).isTrue()
        assertThat(RootCoverage.showsPendingLinkNotice(RootRoute.LOGIN, false)).isFalse()
        assertThat(RootCoverage.showsPendingLinkNotice(RootRoute.CONNECTED, true)).isFalse()
        assertThat(RootCoverage.showsPendingLinkNotice(RootRoute.NONE, true)).isFalse()
    }

    @Test
    fun `un changement de compte rend l'ouverture de session inerte`() {
        assertThat(RootCoverage.mayOpenSession(isSwitchingAccount = true)).isFalse()
        assertThat(RootCoverage.mayOpenSession(isSwitchingAccount = false)).isTrue()
    }

    @Test
    fun `les toasts restent au sommet de toute couverture`() {
        RootCover.values().forEach { assertThat(RootCoverage.toastsStayOnTop(it)).isTrue() }
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
