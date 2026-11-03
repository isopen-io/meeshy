package me.meeshy.sdk.model.mediacache

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TransferProgressCadenceTest {
    @Test
    fun `le premier rapport passe toujours`() {
        assertThat(TransferProgressCadence(100).admits(1, 1000, nowMillis = 0)).isTrue()
    }

    @Test
    fun `un rapport trop proche du precedent est retenu`() {
        val cadence = TransferProgressCadence(100)
        cadence.admits(1, 1000, 0)
        assertThat(cadence.admits(2, 1000, 50)).isFalse()
        assertThat(cadence.admits(3, 1000, 99)).isFalse()
    }

    @Test
    fun `un rapport apres l'intervalle passe et relance la cadence`() {
        val cadence = TransferProgressCadence(100)
        cadence.admits(1, 1000, 0)
        assertThat(cadence.admits(2, 1000, 100)).isTrue()
        assertThat(cadence.admits(3, 1000, 150)).isFalse()
    }

    @Test
    fun `le dernier rapport passe meme dans l'intervalle`() {
        val cadence = TransferProgressCadence(100)
        cadence.admits(1, 1000, 0)
        assertThat(cadence.admits(1000, 1000, 1)).isTrue()
    }

    @Test
    fun `une taille inconnue n'est jamais complete`() {
        val cadence = TransferProgressCadence(100)
        cadence.admits(1, 0, 0)
        assertThat(cadence.admits(5_000, 0, 10)).isFalse()
    }
}
