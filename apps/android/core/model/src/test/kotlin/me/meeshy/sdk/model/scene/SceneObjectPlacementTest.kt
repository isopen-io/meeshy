package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneObjectPlacementTest {

    private fun growScene(count: Int): SceneLists =
        (1..count).fold(SceneLists()) { lists, i ->
            val p = lists.nextObjectPosition()
            lists.copy(texts = lists.texts + text("t$i", x = p.x, y = p.y))
        }

    @Test
    fun `deux objets neufs ne se posent jamais au meme point`() {
        val points = growScene(5).texts.map { it.x to it.y }
        assertThat(points.toSet()).hasSize(5)
    }

    @Test
    fun `un fond ne decale pas le premier objet pose`() {
        val lists = SceneLists(medias = listOf(media("bg", bg = true)), audios = listOf(audio("abg", bg = true)))
        assertThat(lists.nextObjectPosition().x).isEqualTo(0.5)
    }

    @Test
    fun `tous les genres comptent dans la cascade`() {
        val lists = SceneLists(stickers = listOf(sticker("s1")))
        assertThat(lists.nextObjectPosition().x).isGreaterThan(0.5)
    }
}
