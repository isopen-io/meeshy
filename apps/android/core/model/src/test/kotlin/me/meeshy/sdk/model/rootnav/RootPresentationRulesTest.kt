package me.meeshy.sdk.model.rootnav

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RootPresentationRulesTest {

    private fun route(
        authenticated: Boolean = false,
        switching: Boolean = false,
        checked: Boolean = true,
        preview: Boolean = false,
    ) = RootPresentationRules.route(authenticated, switching, checked, preview)

    @Test
    fun `une session authentifiee est connectee quoi qu'il arrive`() {
        for (checked in listOf(true, false)) for (preview in listOf(true, false)) for (switching in listOf(true, false)) {
            assertThat(route(authenticated = true, checked = checked, preview = preview, switching = switching))
                .isEqualTo(RootRoute.CONNECTED)
        }
    }

    @Test
    fun `la connexion n'apparait qu'une fois la session verifiee hors apercu et hors changement de compte`() {
        assertThat(route()).isEqualTo(RootRoute.LOGIN)
        assertThat(route(checked = false)).isEqualTo(RootRoute.NONE)
        assertThat(route(preview = true)).isEqualTo(RootRoute.NONE)
        assertThat(route(switching = true)).isEqualTo(RootRoute.NONE)
    }

    @Test
    fun `la couverture invite exige une session invitee`() {
        assertThat(RootPresentationRules.showsGuestCover(null, isAuthenticated = false)).isFalse()
        assertThat(RootPresentationRules.showsGuestCover(null, isAuthenticated = true)).isFalse()
    }

    @Test
    fun `un accident est refuse une fois connecte et un choix delibere est garde`() {
        val accident = RootGuestSession(isDeliberate = false)
        val chosen = RootGuestSession(isDeliberate = true)
        assertThat(RootPresentationRules.showsGuestCover(accident, isAuthenticated = false)).isTrue()
        assertThat(RootPresentationRules.showsGuestCover(accident, isAuthenticated = true)).isFalse()
        assertThat(RootPresentationRules.showsGuestCover(chosen, isAuthenticated = true)).isTrue()
        assertThat(RootPresentationRules.showsGuestCover(chosen, isAuthenticated = false)).isTrue()
    }

    @Test
    fun `le contenu visiteur exige ni session ni invite ni rideau couvrant`() {
        fun eligible(auth: Boolean = false, guest: Boolean = false, phase: SplashPhase = SplashPhase.GONE) =
            RootPresentationRules.visitorContentIsEligible(auth, guest, phase)
        assertThat(eligible()).isTrue()
        assertThat(eligible(phase = SplashPhase.REVEALING)).isTrue()
        assertThat(eligible(phase = SplashPhase.COVERING)).isFalse()
        assertThat(eligible(guest = true)).isFalse()
        assertThat(eligible(auth = true)).isFalse()
    }

    @Test
    fun `l'onboarding exige les cinq conjonctions`() {
        fun shows(
            completed: Boolean = false,
            authenticated: Boolean = false,
            phase: SplashPhase = SplashPhase.GONE,
            guest: Boolean = false,
            visitor: Boolean = false,
        ) = RootPresentationRules.showsOnboarding(completed, authenticated, phase, guest, visitor)
        assertThat(shows()).isTrue()
        assertThat(shows(completed = true)).isFalse()
        assertThat(shows(authenticated = true)).isFalse()
        assertThat(shows(phase = SplashPhase.COVERING)).isFalse()
        assertThat(shows(guest = true)).isFalse()
        assertThat(shows(visitor = true)).isFalse()
    }

    @Test
    fun `la celebration exige une session et la celebration en cours`() {
        assertThat(RootPresentationRules.showsCelebration(isAuthenticated = true, isShowing = true)).isTrue()
        assertThat(RootPresentationRules.showsCelebration(isAuthenticated = false, isShowing = true)).isFalse()
        assertThat(RootPresentationRules.showsCelebration(isAuthenticated = true, isShowing = false)).isFalse()
    }

    @Test
    fun `le contenu est transparent sous le rideau et opaque ensuite`() {
        assertThat(RootPresentationRules.contentAlpha(SplashPhase.COVERING)).isEqualTo(0f)
        assertThat(RootPresentationRules.contentAlpha(SplashPhase.REVEALING)).isEqualTo(1f)
        assertThat(RootPresentationRules.contentAlpha(SplashPhase.GONE)).isEqualTo(1f)
    }
}
