package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneObjectQueriesTest {

    private val lists = SceneLists(
        texts = listOf(text("t1", z = 3)),
        medias = listOf(media("m1", z = 1), media("bg", bg = true, z = 0)),
        stickers = listOf(sticker("s1", z = 2)),
        places = listOf(place("p1", z = 4)),
        audios = listOf(audio("a1", z = 5), audio("abg", bg = true)),
    )

    @Test
    fun `un objet de chacun des cinq genres se retrouve par son identifiant`() {
        listOf("t1", "m1", "s1", "p1", "a1").forEach { id ->
            assertThat(lists.sceneObject(id)?.id).isEqualTo(id)
        }
        assertThat(lists.sceneObject("t1")).isInstanceOf(MeeshySceneObject.Text::class.java)
        assertThat(lists.sceneObject("p1")).isInstanceOf(MeeshySceneObject.Place::class.java)
        assertThat(lists.sceneObject("a1")).isInstanceOf(MeeshySceneObject.Audio::class.java)
    }

    @Test
    fun `un identifiant qui ne designe plus rien rend null`() {
        assertThat(lists.sceneObject("nope")).isNull()
    }

    @Test
    fun `la scene est triee du fond vers l avant de facon stable`() {
        val ids = lists.sceneObjects.map { it.id }
        assertThat(ids.takeLast(5)).containsExactly("m1", "s1", "t1", "p1", "a1").inOrder()
        assertThat(ids.take(2)).containsExactly("bg", "abg").inOrder()
    }

    @Test
    fun `les fonds ne sont pas des objets poses`() {
        assertThat(lists.posedObjects.map { it.id }).containsNoneOf("bg", "abg")
        assertThat(lists.posedObjects).hasSize(5)
    }

    @Test
    fun `la cascade evite les objets poses mais ignore les fonds`() {
        val onlyBackground = SceneLists(medias = listOf(media("bg", bg = true)))
        assertThat(onlyBackground.nextObjectPosition().x).isEqualTo(0.5)
        val oneText = SceneLists(texts = listOf(text("t1")))
        assertThat(oneText.nextObjectPosition().x).isWithin(1e-9).of(0.56)
    }

    @Test
    fun `le projet de timeline expose aussi ses cinq familles`() {
        val project = me.meeshy.sdk.model.timeline.TimelineProject(
            slideId = "s", slideDuration = 5f,
            textObjects = listOf(text("t1")), locationObjects = listOf(place("p1")),
        )
        assertThat(project.sceneLists.sceneObject("p1")).isNotNull()
        assertThat(project.sceneLists.sceneObjects).hasSize(2)
    }
}
