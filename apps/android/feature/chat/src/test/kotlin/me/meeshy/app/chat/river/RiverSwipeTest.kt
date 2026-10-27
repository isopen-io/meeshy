package me.meeshy.app.chat.river

import androidx.compose.ui.geometry.Offset
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.river.RiverStepDirection
import org.junit.Test

class RiverSwipeTest {
    private fun dir(x: Float, y: Float, rtl: Boolean = false) = RiverSwipe.direction(Offset(x, y), 40f, rtl)

    @Test
    fun `sous le seuil ce n'est pas un balayage`() {
        assertThat(dir(20f, 10f)).isNull()
    }

    @Test
    fun `l'axe dominant decide - vers la gauche de l'ecran on avance vers la droite du plan`() {
        assertThat(dir(-80f, 10f)).isEqualTo(RiverStepDirection.RIGHT)
        assertThat(dir(80f, 10f)).isEqualTo(RiverStepDirection.LEFT)
        assertThat(dir(5f, -90f)).isEqualTo(RiverStepDirection.DOWN)
        assertThat(dir(5f, 90f)).isEqualTo(RiverStepDirection.UP)
    }

    @Test
    fun `en lecture de droite a gauche le sens horizontal se retourne, jamais le vertical`() {
        assertThat(dir(-80f, 0f, rtl = true)).isEqualTo(RiverStepDirection.LEFT)
        assertThat(dir(0f, -80f, rtl = true)).isEqualTo(RiverStepDirection.DOWN)
    }
}
