package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameLevelConfirmationTest {

    @Test
    fun `une montee reglee est gagnee`() {
        val c = GameLevelConfirmation(confirmed = 10)
        assertThat(c.observe(level = 11, settled = true)).isTrue()
        assertThat(c.confirmed).isEqualTo(11)
    }

    @Test
    fun `tant qu un geste est en vol rien n est juge`() {
        val c = GameLevelConfirmation(confirmed = 10)
        assertThat(c.observe(level = 12, settled = false)).isFalse()
        assertThat(c.confirmed).isEqualTo(10)
        assertThat(c.observe(level = 12, settled = true)).isTrue()
    }

    @Test
    fun `un niveau restaure apres refus ne se fete pas`() {
        val c = GameLevelConfirmation(confirmed = 10)
        assertThat(c.observe(level = 9, settled = false)).isFalse()
        assertThat(c.observe(level = 10, settled = true)).isFalse()
        assertThat(c.confirmed).isEqualTo(10)
    }

    @Test
    fun `une baisse confirmee abaisse la reference puis la remontee se fete`() {
        val c = GameLevelConfirmation(confirmed = 10)
        assertThat(c.observe(level = 9, settled = true)).isFalse()
        assertThat(c.confirmed).isEqualTo(9)
        assertThat(c.observe(level = 10, settled = true)).isTrue()
    }
}
