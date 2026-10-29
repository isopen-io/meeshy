package me.meeshy.app.stories

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
}
