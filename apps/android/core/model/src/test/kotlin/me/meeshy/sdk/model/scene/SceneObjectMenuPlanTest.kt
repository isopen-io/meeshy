package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.scene.SceneObjectMenuPlan.Action
import me.meeshy.sdk.model.scene.SceneObjectMenuPlan.Capabilities
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneObjectMenuPlanTest {

    private val everything = Capabilities(
        hasEditor = true, canTrim = true, canLeaveScene = true, canBecomeBackground = true,
    )

    @Test
    fun `l'ordre est fixe et Supprimer vient en dernier`() {
        val lists = SceneLists(
            medias = listOf(StoryMediaObject("v", mediaType = "video"), StoryMediaObject("o")),
        )
        assertThat(SceneObjectMenuPlan.offered(lists, "v", everything)).containsExactly(
            Action.EDIT, Action.TRIM, Action.DUPLICATE, Action.BRING_FORWARD, Action.SEND_BACKWARD,
            Action.LEAVE_SCENE, Action.SET_AS_BACKGROUND, Action.DELETE,
        ).inOrder()
    }

    @Test
    fun `une action sans effet est absente`() {
        val lists = SceneLists(texts = listOf(StoryTextObject("t")))
        val offered = SceneObjectMenuPlan.offered(lists, "t", Capabilities())
        assertThat(offered).containsExactly(Action.DUPLICATE, Action.DELETE).inOrder()
    }

    @Test
    fun `un objet seul de son plan n'offre pas l'empilement`() {
        val lists = SceneLists(texts = listOf(StoryTextObject("t")), medias = listOf(StoryMediaObject("bg", isBackground = true)))
        assertThat(SceneObjectMenuPlan.offered(lists, "t", everything))
            .containsNoneOf(Action.BRING_FORWARD, Action.SEND_BACKWARD)
    }

    @Test
    fun `un fond n'empile pas et n'est pas remplace par lui-meme`() {
        val lists = SceneLists(
            medias = listOf(StoryMediaObject("bg", isBackground = true)),
            texts = listOf(StoryTextObject("t")),
        )
        val offered = SceneObjectMenuPlan.offered(lists, "bg", everything)
        assertThat(offered).containsNoneOf(
            Action.BRING_FORWARD, Action.SEND_BACKWARD, Action.SET_AS_BACKGROUND, Action.REPLACE_BACKGROUND,
        )
    }

    @Test
    fun `un objet verrouille n'offre que l'empilement`() {
        val lists = SceneLists(texts = listOf(StoryTextObject("badge", isLocked = true)), stickers = listOf(StorySticker("s")))
        assertThat(SceneObjectMenuPlan.offered(lists, "badge", everything))
            .containsExactly(Action.BRING_FORWARD, Action.SEND_BACKWARD).inOrder()
    }

    @Test
    fun `le mot dit s'il y a un fond a remplacer`() {
        val lists = SceneLists(medias = listOf(StoryMediaObject("m")))
        val set = SceneObjectMenuPlan.offered(lists, "m", everything.copy(sceneHasBackground = false))
        val replace = SceneObjectMenuPlan.offered(lists, "m", everything.copy(sceneHasBackground = true))
        assertThat(set).contains(Action.SET_AS_BACKGROUND)
        assertThat(set).doesNotContain(Action.REPLACE_BACKGROUND)
        assertThat(replace).contains(Action.REPLACE_BACKGROUND)
        assertThat(replace).doesNotContain(Action.SET_AS_BACKGROUND)
    }

    @Test
    fun `rogner exige la capacite ET une source rognable`() {
        val lists = SceneLists(medias = listOf(StoryMediaObject("img", mediaType = "image"), StoryMediaObject("v", mediaType = "video")))
        assertThat(SceneObjectMenuPlan.offered(lists, "img", everything)).doesNotContain(Action.TRIM)
        assertThat(SceneObjectMenuPlan.offered(lists, "v", everything.copy(canTrim = false))).doesNotContain(Action.TRIM)
    }

    @Test
    fun `un objet disparu n'a pas de menu`() {
        assertThat(SceneObjectMenuPlan.offered(SceneLists(), "ghost", everything)).isEmpty()
    }

    @Test
    fun `le badge dit le genre, le plan et le rang`() {
        val lists = SceneLists(
            texts = listOf(StoryTextObject("t", zIndex = 2)),
            medias = listOf(StoryMediaObject("bg", isBackground = true)),
        )
        assertThat(SceneSelectionBadge.text(lists, "t")).isEqualTo("TEXT · PLAN FG · z 2")
        assertThat(SceneSelectionBadge.text(lists, "bg")).isEqualTo("MEDIA · PLAN BG · z 0")
        assertThat(SceneSelectionBadge.text(lists, "ghost")).isNull()
    }
}
