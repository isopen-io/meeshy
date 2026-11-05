package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedPlace
import org.junit.Test

class SendPlaceTileLawTest {
    private val paris = SharedPlace(48.85, 2.35, name = "Paris")
    private val lyon = SharedPlace(45.76, 4.83, name = "Lyon")

    @Test
    fun `un envoi parti vide la tuile`() {
        assertThat(SendPlaceTileLaw.outcome(sent = true)).isEqualTo(SendPlaceTileLaw.Outcome.CLEARED)
        assertThat(SendPlaceTileLaw.restoration(paris, sent = true, current = null)).isNull()
    }

    @Test
    fun `un envoi en echec restaure le lieu`() {
        assertThat(SendPlaceTileLaw.outcome(sent = false)).isEqualTo(SendPlaceTileLaw.Outcome.RESTORED)
        assertThat(SendPlaceTileLaw.restoration(paris, sent = false, current = null)).isEqualTo(paris)
    }

    @Test
    fun `un lieu choisi entre-temps n'est jamais ecrase`() {
        assertThat(SendPlaceTileLaw.restoration(paris, sent = false, current = lyon)).isNull()
    }

    @Test
    fun `sans instantane il n'y a rien a restaurer`() {
        assertThat(SendPlaceTileLaw.restoration(null, sent = false, current = null)).isNull()
    }
}
