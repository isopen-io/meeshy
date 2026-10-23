package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryEasing
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneRenderPlannerTest {

    private fun timed(id: String, start: Double, duration: Double, z: Int = 0) =
        text(id, z).copy(startTime = start, duration = duration)

    private fun plan(
        lists: SceneLists,
        time: Double,
        mode: SceneRenderMode,
        ghost: Double? = null,
    ) = SceneRenderPlanner.plan(lists, time, mode, ghostOpacity = ghost)

    @Test
    fun `en edition tous les objets sont visibles a pleine opacite meme hors fenetre`() {
        val lists = SceneLists(texts = listOf(timed("a", 10.0, 2.0)), stickers = listOf(sticker("s")))
        val items = plan(lists, time = 0.0, mode = SceneRenderMode.EDIT)
        assertThat(items.map { it.id }).containsExactly("a", "s")
        assertThat(items.map { it.pose.opacity }).containsExactly(1.0, 1.0)
        assertThat(items.all { !it.isGhost }).isTrue()
    }

    @Test
    fun `en lecture un objet hors de sa fenetre n existe pas`() {
        val lists = SceneLists(texts = listOf(timed("a", 2.0, 2.0)))
        assertThat(plan(lists, 1.0, SceneRenderMode.PLAY)).isEmpty()
        assertThat(plan(lists, 2.0, SceneRenderMode.PLAY)).hasSize(1)
        assertThat(plan(lists, 4.0, SceneRenderMode.PLAY)).isEmpty()
    }

    @Test
    fun `a l arret dans la frise un objet hors fenetre est un fantome a 0,25`() {
        val lists = SceneLists(texts = listOf(timed("a", 2.0, 2.0)))
        val item = plan(lists, 0.0, SceneRenderMode.PLAY, ghost = SCENE_GHOST_OPACITY).single()
        assertThat(item.isGhost).isTrue()
        assertThat(item.pose.opacity).isEqualTo(0.25)
        val inside = plan(lists, 3.0, SceneRenderMode.PLAY, ghost = SCENE_GHOST_OPACITY).single()
        assertThat(inside.isGhost).isFalse()
        assertThat(inside.pose.opacity).isEqualTo(1.0)
    }

    @Test
    fun `l ordre de peinture est plan puis z croissant`() {
        val lists = SceneLists(
            texts = listOf(text("t", z = 1)),
            medias = listOf(media("m", z = 9), media("bg", bg = true)),
            stickers = listOf(sticker("s", z = 3)),
            places = listOf(place("p", z = 2)),
        )
        val ids = plan(lists, 0.0, SceneRenderMode.EDIT).map { it.id }
        assertThat(ids).containsExactly("m", "t", "p", "s").inOrder()
        assertThat(plan(lists, 0.0, SceneRenderMode.PLAY).map { it.id }).isEqualTo(ids)
    }

    @Test
    fun `l element verrouille est signale et reste dans le plan`() {
        val lists = SceneLists(texts = listOf(text("t", locked = true), text("u")))
        val items = plan(lists, 0.0, SceneRenderMode.EDIT).associateBy { it.id }
        assertThat(items.getValue("t").isLocked).isTrue()
        assertThat(items.getValue("u").isLocked).isFalse()
    }

    @Test
    fun `la puce audio est un element du plan au dessus du contenu`() {
        val lists = SceneLists(medias = listOf(media("m", z = 5)), audios = listOf(audio("a", z = 0)))
        val items = plan(lists, 0.0, SceneRenderMode.EDIT)
        assertThat(items.map { it.id }).containsExactly("m", "a").inOrder()
    }
}
