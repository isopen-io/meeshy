package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReactionAnimationGateTest {
    private class Clock(var now: Long = 1_000L)

    private fun gate(clock: Clock) = ReactionAnimationGate { clock.now }

    @Test
    fun `une reaction locale nouvelle s'anime pendant la fenetre`() {
        val clock = Clock()
        val gate = gate(clock)
        gate.markAdded("m1", "👍")
        assertThat(gate.shouldAnimate("m1", "👍")).isTrue()
    }

    @Test
    fun `une reaction venue du socket s'anime de meme`() {
        val clock = Clock()
        val gate = gate(clock)
        gate.markAdded("m2", "❤️")
        assertThat(gate.shouldAnimate("m2", "❤️")).isTrue()
    }

    @Test
    fun `une reaction jamais marquee ne s'anime pas au recyclage de cellule`() {
        val gate = gate(Clock())
        assertThat(gate.shouldAnimate("m1", "👍")).isFalse()
    }

    @Test
    fun `la fenetre expiree rend l'etat final sans rejeu`() {
        val clock = Clock()
        val gate = gate(clock)
        gate.markAdded("m1", "👍")
        clock.now += ReactionAnimationGate.WINDOW_MILLIS
        assertThat(gate.shouldAnimate("m1", "👍")).isFalse()
    }

    @Test
    fun `une autre reaction ou un autre message ne s'anime pas`() {
        val gate = gate(Clock())
        gate.markAdded("m1", "👍")
        assertThat(gate.shouldAnimate("m1", "😂")).isFalse()
        assertThat(gate.shouldAnimate("m2", "👍")).isFalse()
    }
}
