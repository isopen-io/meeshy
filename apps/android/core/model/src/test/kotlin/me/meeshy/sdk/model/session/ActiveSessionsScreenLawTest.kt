package me.meeshy.sdk.model.session

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.session.ActiveSessionsScreenLaw.Banner
import me.meeshy.sdk.model.session.ActiveSessionsScreenLaw.Mode
import org.junit.Test

class ActiveSessionsScreenLawTest {

    private fun payload(vararg sessions: UserSession) = UserSessionsPayload(sessions.toList(), sessions.size)
    private val current = UserSession(id = "me", isCurrentSession = true)

    @Test
    fun `an empty cache shows the skeleton until a revalidation fails`() {
        assertThat(ActiveSessionsScreenLaw.mode(null, syncFailed = false, isOnline = true)).isEqualTo(Mode.SKELETON)
        assertThat(ActiveSessionsScreenLaw.mode(null, syncFailed = false, isOnline = false)).isEqualTo(Mode.SKELETON)
    }

    @Test
    fun `no cache and a failure is offline when the network is gone, an error otherwise`() {
        assertThat(ActiveSessionsScreenLaw.mode(null, syncFailed = true, isOnline = false)).isEqualTo(Mode.OFFLINE)
        assertThat(ActiveSessionsScreenLaw.mode(null, syncFailed = true, isOnline = true)).isEqualTo(Mode.ERROR)
    }

    @Test
    fun `a known list is always content, even when the refresh failed`() {
        assertThat(ActiveSessionsScreenLaw.mode(payload(current), syncFailed = true, isOnline = false)).isEqualTo(Mode.CONTENT)
        assertThat(ActiveSessionsScreenLaw.mode(payload(current), syncFailed = false, isOnline = true)).isEqualTo(Mode.CONTENT)
    }

    @Test
    fun `a served list without any session is the empty state`() {
        assertThat(ActiveSessionsScreenLaw.mode(payload(), syncFailed = false, isOnline = true)).isEqualTo(Mode.EMPTY)
    }

    @Test
    fun `the banner only accompanies a known list after a failure`() {
        assertThat(ActiveSessionsScreenLaw.banner(payload(current), syncFailed = true, isOnline = false)).isEqualTo(Banner.OFFLINE)
        assertThat(ActiveSessionsScreenLaw.banner(payload(current), syncFailed = true, isOnline = true)).isEqualTo(Banner.ERROR)
        assertThat(ActiveSessionsScreenLaw.banner(payload(current), syncFailed = false, isOnline = false)).isNull()
        assertThat(ActiveSessionsScreenLaw.banner(null, syncFailed = true, isOnline = true)).isNull()
        assertThat(ActiveSessionsScreenLaw.banner(payload(), syncFailed = true, isOnline = true)).isNull()
    }

    @Test
    fun `attribution is due as soon as one place is shown`() {
        assertThat(ActiveSessionsScreenLaw.showsGeolocation(listOf(current))).isFalse()
        assertThat(ActiveSessionsScreenLaw.showsGeolocation(listOf(current, UserSession(id = "a", city = "Lyon")))).isTrue()
        assertThat(ActiveSessionsScreenLaw.showsGeolocation(listOf(UserSession(id = "b", country = "FR")))).isTrue()
        assertThat(ActiveSessionsScreenLaw.showsGeolocation(listOf(UserSession(id = "c", city = " ")))).isFalse()
    }
}
