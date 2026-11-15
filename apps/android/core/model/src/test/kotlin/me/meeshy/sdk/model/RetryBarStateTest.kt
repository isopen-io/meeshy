package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RetryBarStateTest {
    private fun failed() = RetryBarState.forStatus(isFailed = true)

    @Test fun `un echec montre la bande fixe au repos`() {
        assertThat(failed().phase).isEqualTo(RetryBarPhase.Rest)
        assertThat(failed().blinks(reduceMotion = false)).isFalse()
    }

    @Test fun `hors echec la bande est absente`() {
        assertThat(RetryBarState.forStatus(isFailed = false).isVisible).isFalse()
    }

    @Test fun `le toucher engage le renvoi et fait clignoter`() {
        val s = failed().onTap()
        assertThat(s.phase).isEqualTo(RetryBarPhase.Retrying)
        assertThat(s.blinks(reduceMotion = false)).isTrue()
    }

    @Test fun `reduire les animations garde la bande fixe`() {
        assertThat(failed().onTap().blinks(reduceMotion = true)).isFalse()
    }

    @Test fun `un second toucher pendant le renvoi est ignore`() {
        val s = failed().onTap()
        assertThat(s.onTap()).isEqualTo(s)
    }

    @Test fun `la bande disparait quand le statut quitte l'echec`() {
        assertThat(failed().onTap().onFailedChanged(false).isVisible).isFalse()
    }

    @Test fun `un nouvel echec recree la bande fixe`() {
        val again = failed().onTap().onFailedChanged(false).onFailedChanged(true)
        assertThat(again.phase).isEqualTo(RetryBarPhase.Rest)
    }

    @Test fun `un statut echec repete ne reinitialise pas le renvoi en cours`() {
        val s = failed().onTap()
        assertThat(s.onFailedChanged(true)).isEqualTo(s)
    }

    @Test fun `la cible tactile couvre au moins 48 dp`() {
        assertThat(RetryBarState.MIN_TARGET_DP).isAtLeast(48)
        assertThat(RetryBarState.BAND_WIDTH_DP).isEqualTo(32)
    }
}
