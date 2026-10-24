package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CaptureShieldScopeTest {

    @Test
    fun `none shields nothing and all shields everything`() {
        assertThat(CaptureShieldScope.None.shields("a")).isFalse()
        assertThat(CaptureShieldScope.None.shields(null)).isFalse()
        assertThat(CaptureShieldScope.All.shields("a")).isTrue()
        assertThat(CaptureShieldScope.All.shields(null)).isTrue()
    }

    @Test
    fun `all except is closed by default - unknown or anonymous pieces are shielded`() {
        val scope = CaptureShieldScope.allExcept(setOf("free"))
        assertThat(scope.shields("free")).isFalse()
        assertThat(scope.shields("other")).isTrue()
        assertThat(scope.shields(null)).isTrue()
    }

    @Test
    fun `scope is decided per piece of the message that carries it`() {
        val ordinary = MessageExitOffer.Unrestricted
        val viewOnce = MessageExitOffer(ContentExitLaw.ViewOnce, holdsBlur = false, isEncrypted = false)
        val flame = MessageExitOffer(ContentExitLaw.AfterReadFlame, holdsBlur = false, isEncrypted = false)
        val messages = listOf(ordinary to listOf("p1"), viewOnce to listOf("p2"), flame to listOf("p3"))
        val closed = MessageExitOffer.captureShieldScope(messages)
        assertThat(closed.shields("p1")).isFalse()
        assertThat(closed.shields("p2")).isTrue()
        assertThat(closed.shields("p3")).isTrue()
        val announcing = MessageExitOffer.captureShieldScope(messages, surfaceAnnounces = true)
        assertThat(announcing.shields("p3")).isFalse()
        assertThat(announcing.shields("p2")).isTrue()
    }
}
