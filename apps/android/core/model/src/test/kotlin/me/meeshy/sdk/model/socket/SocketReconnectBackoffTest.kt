package me.meeshy.sdk.model.socket

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SocketReconnectBackoffTest {

    private fun delays(count: Int, jitter: Double): List<Long> =
        generateSequence(SocketReconnectBackoff().next(jitter)) { it.backoff.next(jitter) }
            .take(count).map { it.delayMs }.toList()

    @Test
    fun `l'echelle double de 1 s jusqu'a 60 s puis plafonne`() {
        assertThat(delays(9, 1.0))
            .containsExactly(1_000L, 2_000L, 4_000L, 8_000L, 16_000L, 32_000L, 60_000L, 60_000L, 60_000L).inOrder()
    }

    @Test
    fun `le plafond tient meme avec un jitter maximal`() {
        assertThat(delays(10, 1.2).max()).isEqualTo(60_000L)
    }

    @Test
    fun `le jitter est borne entre 0,8 et 1,2 et deterministe`() {
        assertThat(SocketReconnectBackoff.jitterOf(0.0)).isEqualTo(0.8)
        assertThat(SocketReconnectBackoff.jitterOf(1.0)).isWithin(1e-9).of(1.2)
        assertThat(SocketReconnectBackoff.jitterOf(9.0)).isWithin(1e-9).of(1.2)
        assertThat(SocketReconnectBackoff().next(0.8).delayMs).isEqualTo(800L)
        assertThat(SocketReconnectBackoff().next(0.8).delayMs).isEqualTo(800L)
    }

    @Test
    fun `chaque tentative est comptee et la remise a zero repart du plancher`() {
        val advanced = SocketReconnectBackoff().next(1.0).backoff.next(1.0).backoff
        assertThat(advanced.attempt).isEqualTo(2)
        val reset = advanced.reset()
        assertThat(reset.attempt).isEqualTo(0)
        assertThat(reset.next(1.0).delayMs).isEqualTo(1_000L)
    }
}
