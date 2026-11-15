package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryEffects
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneObjectLegacyRoundTripTest {

    @Test
    fun `effets vers objets unifies et retour ne perdent rien`() {
        val effects = StoryEffects(
            textObjects = listOf(text("t2", z = 9), text("t1", z = 1)),
            mediaObjects = listOf(media("m1", z = 4), media("m2", z = 2)),
            stickerObjects = listOf(sticker("s1", z = 3)),
            audioPlayerObjects = listOf(audio("a1", z = 7)),
        )
        val places = listOf(place("p1", z = 5), place("p0", z = 1))
        val lists = effects.sceneLists(places)

        val back = SceneLists.from(lists.sceneObjects, previous = lists)

        assertThat(back).isEqualTo(lists)
        assertThat(effects.applying(back)).isEqualTo(effects)
    }

    @Test
    fun `une liste optionnelle nulle reste nulle sans objet de sa famille`() {
        val effects = StoryEffects(textObjects = listOf(text("t1")))
        val back = effects.applying(effects.sceneLists())
        assertThat(back.mediaObjects).isNull()
        assertThat(back.stickerObjects).isNull()
        assertThat(back.audioPlayerObjects).isNull()
    }

    @Test
    fun `une liste optionnelle vide reste vide`() {
        val effects = StoryEffects(mediaObjects = emptyList())
        assertThat(effects.applying(effects.sceneLists()).mediaObjects).isEmpty()
    }

    @Test
    fun `un objet neuf s ajoute en fin de sa famille`() {
        val lists = SceneLists(texts = listOf(text("t1")))
        val grown = SceneLists.from(lists.sceneObjects + MeeshySceneObject.Text(text("t2", z = -1)), previous = lists)
        assertThat(grown.texts.map { it.id }).containsExactly("t1", "t2").inOrder()
    }
}
