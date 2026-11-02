package me.meeshy.sdk.model.chrome

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RootChromeVisibilityTest {

    private val roots = setOf("conversations", "feed")

    @Test
    fun `the buttons show on a root route`() {
        assertThat(RootChromeVisibility.showsFloatingChrome("conversations", roots)).isTrue()
        assertThat(RootChromeVisibility.showsFloatingChrome("feed", roots)).isTrue()
    }

    @Test
    fun `the buttons hide on a deep route`() {
        assertThat(RootChromeVisibility.showsFloatingChrome("chat/{conversationId}", roots)).isFalse()
        assertThat(RootChromeVisibility.showsFloatingChrome("profile/me", roots)).isFalse()
    }

    @Test
    fun `nothing composed yet shows no buttons`() {
        assertThat(RootChromeVisibility.showsFloatingChrome(null, roots)).isFalse()
    }

    @Test
    fun `the buttons hide while the reels play, even over a root route`() {
        assertThat(RootChromeVisibility.showsFloatingChrome("feed", roots, isReelsPresented = true)).isFalse()
    }

    @Test
    fun `the buttons hide while the onboarding covers the chrome`() {
        assertThat(RootChromeVisibility.showsFloatingChrome("conversations", roots, isOnboardingPresented = true)).isFalse()
    }
}
