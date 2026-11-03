package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.scene.SceneAccessibilityPlan.Label
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneAccessibilityPlanTest {

    @Test
    fun `une slide vide n'a ni resume ni entree`() {
        assertThat(SceneAccessibilityPlan.build(SceneLists())).isEqualTo(SceneAccessibilityPlan.EMPTY)
    }

    @Test
    fun `le dessin seul donne un resume mais aucune entree`() {
        val plan = SceneAccessibilityPlan.build(SceneLists(), hasDrawing = true)
        assertThat(plan.summary?.count).isEqualTo(1)
        assertThat(plan.summary?.labels).containsExactly(Label.Drawing)
        assertThat(plan.entries).isEmpty()
    }

    @Test
    fun `le resume compte les objets et le dessin, dans l'ordre texte media sticker lieu`() {
        val lists = SceneLists(
            texts = listOf(StoryTextObject("t", text = "Bonjour")),
            medias = listOf(StoryMediaObject("m", mediaType = "video")),
            stickers = listOf(StorySticker("s", emoji = "🔥")),
            places = listOf(StoryLocationObject("p", SharedPlace(1.0, 2.0, name = "Paris"))),
        )
        val plan = SceneAccessibilityPlan.build(lists, hasDrawing = true)
        assertThat(plan.summary?.count).isEqualTo(5)
        assertThat(plan.entries.map { it.label }).containsExactly(
            Label.Text("Bonjour"), Label.Media(video = true, background = false),
            Label.Sticker("Fire"), Label.Place("Paris"),
        ).inOrder()
    }

    @Test
    fun `le fond se nomme fond`() {
        val lists = SceneLists(medias = listOf(StoryMediaObject("bg", isBackground = true)))
        assertThat(SceneAccessibilityPlan.build(lists).entries.single().label)
            .isEqualTo(Label.Media(video = false, background = true))
    }

    @Test
    fun `le texte est lu dans la langue du Prisme sur un rang autre que le premier`() {
        val lists = SceneLists(
            texts = listOf(
                StoryTextObject("t", text = "Hello", sourceLanguage = "en", translations = mapOf("es" to "Hola")),
            ),
        )
        val readers = SceneReaderLanguages(listOf("fr", "es"))
        assertThat(SceneAccessibilityPlan.build(lists, readers).entries.single().label).isEqualTo(Label.Text("Hola"))
    }

    @Test
    fun `sans traduction vers une langue du lecteur on lit l'original`() {
        val lists = SceneLists(
            texts = listOf(StoryTextObject("t", text = "Hello", sourceLanguage = "en", translations = mapOf("de" to "Hallo"))),
        )
        val readers = SceneReaderLanguages(listOf("fr"))
        assertThat(SceneAccessibilityPlan.build(lists, readers).entries.single().label).isEqualTo(Label.Text("Hello"))
    }

    @Test
    fun `un texte blanc se dit vide`() {
        val lists = SceneLists(texts = listOf(StoryTextObject("t", text = "  ")))
        assertThat(SceneAccessibilityPlan.build(lists).entries.single().label).isEqualTo(Label.EmptyText)
    }

    @Test
    fun `un identifiant de sticker qui n'est pas un emoji n'a pas de nom`() {
        assertThat(SceneAccessibilityPlan.unicodeName("")).isNull()
    }

    @Test
    fun `les actions d'un objet sont celles du menu`() {
        val lists = SceneLists(texts = listOf(StoryTextObject("badge", isLocked = true)), stickers = listOf(StorySticker("s")))
        val plan = SceneAccessibilityPlan.build(lists)
        val locked = plan.entries.first { it.id == "badge" }
        assertThat(locked.actions).containsExactly(
            SceneObjectMenuPlan.Action.BRING_FORWARD, SceneObjectMenuPlan.Action.SEND_BACKWARD,
        ).inOrder()
    }
}
