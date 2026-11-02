package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneZOrderTest {

    private val lists = SceneLists(
        texts = listOf(text("t1", z = 3)),
        stickers = listOf(sticker("s1", z = 7)),
        places = listOf(place("p1", z = 2)),
        audios = listOf(audio("a1", z = 4)),
        medias = listOf(media("m1", z = 5)),
    )

    @Test
    fun `la reydratation reprend les zIndex persistes de tous les genres`() {
        val z = SceneZOrder().rehydrated(lists)
        assertThat(z.ranks).containsExactly("t1", 3, "s1", 7, "p1", 2, "a1", 4, "m1", 5)
        assertThat(z.next).isEqualTo(8)
    }

    @Test
    fun `amener devant donne un rang superieur a tout le reste`() {
        val z = SceneZOrder().rehydrated(lists).bringToFront("p1")
        assertThat(z.rank("p1")).isEqualTo(8)
        assertThat(z.next).isEqualTo(9)
    }

    @Test
    fun `le prochain rang ne recule jamais meme apres une suppression ou une rehydratation plus basse`() {
        val z = SceneZOrder().rehydrated(lists).bringToFront("s1").forget("s1")
        assertThat(z.next).isEqualTo(9)
        assertThat(z.rehydrated(SceneLists(texts = listOf(text("t1", z = 1)))).next).isEqualTo(9)
    }

    @Test
    fun `appliquer ecrit les rangs dans les objets des cinq genres`() {
        val z = SceneZOrder().rehydrated(lists).bringToFront("a1").bringToFront("t1")
        val applied = z.applied(lists)
        assertThat(applied.sceneObject("a1")?.zIndex).isEqualTo(8)
        assertThat(applied.sceneObject("t1")?.zIndex).isEqualTo(9)
        assertThat(applied.sceneObject("m1")?.zIndex).isEqualTo(5)
        assertThat(applied.sceneObjects.last().id).isEqualTo("t1")
    }

    @Test
    fun `un rang inconnu retombe sur le rang persiste`() {
        assertThat(SceneZOrder().rank("x", persisted = 6)).isEqualTo(6)
    }
}
