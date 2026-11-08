package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.scene.MeeshySceneObject.Kind
import me.meeshy.sdk.model.scene.SceneObjectMenuPlan.Action
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StoryElementMenuTest {

    @Test
    fun `chaque action du plan a un mot distinct`() {
        val ids = Action.entries.map { StoryElementMenu.labelRes(it) }
        assertThat(ids.toSet()).hasSize(Action.entries.size)
    }

    @Test
    fun `un texte execute modifier, dupliquer et supprimer, dans l'ordre du plan`() {
        val offered = listOf(Action.EDIT, Action.DUPLICATE, Action.BRING_FORWARD, Action.LEAVE_SCENE, Action.DELETE)
        assertThat(StoryElementMenu.executable(Kind.TEXT, offered))
            .containsExactly(Action.EDIT, Action.DUPLICATE, Action.DELETE).inOrder()
    }

    @Test
    fun `un sticker n'a pas de modifier, une action absente n'est jamais annoncee`() {
        val offered = listOf(Action.EDIT, Action.DUPLICATE, Action.DELETE)
        assertThat(StoryElementMenu.executable(Kind.STICKER, offered)).containsExactly(Action.DUPLICATE, Action.DELETE).inOrder()
        assertThat(StoryElementMenu.executable(Kind.STICKER, listOf(Action.BRING_FORWARD))).isEmpty()
    }

    @Test
    fun `une famille sans geste cable n'annonce rien`() {
        assertThat(StoryElementMenu.executable(Kind.MEDIA, listOf(Action.DUPLICATE, Action.DELETE))).isEmpty()
    }
}
