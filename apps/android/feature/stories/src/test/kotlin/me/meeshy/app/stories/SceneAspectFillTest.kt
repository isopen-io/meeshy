package me.meeshy.app.stories

import androidx.compose.ui.unit.Constraints
import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #13666 — la scène d'un réel remplit sa carte (iOS `.aspectRatio(SceneShape.aspect, .fill)`) : le 9:16 couvre le cadre, rogné au centre. */
class SceneAspectFillTest {

    @Test
    fun `une carte 4 5 est couverte en largeur et la scene deborde en hauteur`() {
        val frame = SceneAspectFill.cover(width = 240f, height = 300f)
        assertThat(frame.width).isEqualTo(240f)
        assertThat(frame.height).isWithin(0.01f).of(240f * 16f / 9f)
    }

    @Test
    fun `une carte plus etroite que le 9 16 est couverte en hauteur et la scene deborde en largeur`() {
        val frame = SceneAspectFill.cover(width = 100f, height = 400f)
        assertThat(frame.height).isEqualTo(400f)
        assertThat(frame.width).isWithin(0.01f).of(400f * 9f / 16f)
    }

    @Test
    fun `la scene couvre toujours tout le cadre et garde son rapport 9 16`() {
        listOf(240f to 300f, 300f to 225f, 100f to 400f, 200f to 200f).forEach { (w, h) ->
            val frame = SceneAspectFill.cover(w, h)
            assertThat(frame.width).isAtLeast(w - 0.01f)
            assertThat(frame.height).isAtLeast(h - 0.01f)
            assertThat(frame.width / frame.height).isWithin(0.001f).of(9f / 16f)
        }
    }

    @Test
    fun `un cadre vide ne donne aucune scene`() {
        assertThat(SceneAspectFill.cover(0f, 300f)).isEqualTo(SceneAspectFill.Size(0f, 0f))
    }

    @Test
    fun `une hauteur non bornee donne a la carte la hauteur du 9 16 a sa largeur`() {
        val host = SceneAspectFill.host(maxWidth = 200, maxHeight = Constraints.Infinity)
        assertThat(host.width).isEqualTo(200)
        assertThat(host.height).isEqualTo(356)
    }

    @Test
    fun `une hauteur bornee est gardee telle quelle`() {
        val host = SceneAspectFill.host(maxWidth = 200, maxHeight = 250)
        assertThat(host).isEqualTo(SceneAspectFill.Host(200, 250))
    }

    @Test
    fun `une largeur non bornee ne donne aucune carte plutot qu un plantage`() {
        assertThat(SceneAspectFill.host(maxWidth = Constraints.Infinity, maxHeight = 250)).isEqualTo(SceneAspectFill.Host(0, 250))
        assertThat(SceneAspectFill.host(Constraints.Infinity, Constraints.Infinity)).isEqualTo(SceneAspectFill.Host(0, 0))
    }
}
