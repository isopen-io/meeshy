package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.SceneObjectMenu.Action
import org.junit.Test

class StoryObjectControllersTest {
    private fun withStickers(vararg ids: String): StoryComposerUiState =
        ids.fold(StoryComposerUiState()) { s, id -> StoryComposerStickerReducer.added(s, "😀", id) }

    @Test
    fun `no object selected means no controllers`() {
        assertThat(StoryComposerUiState().selectedObjectControllers).isNull()
    }

    @Test
    fun `a lone selected sticker is duplicated and deleted, never stacked`() {
        val controllers = withStickers("s1").selectedObjectControllers!!
        assertThat(controllers.ref.kind).isEqualTo(ComposerObjectKind.STICKER)
        assertThat(controllers.actions).containsExactly(Action.DUPLICATE, Action.DELETE).inOrder()
    }

    @Test
    fun `stickers sharing the plane are never stacked by a controller, and editing or trimming are not controllers`() {
        val state = StoryComposerStickerReducer.selected(withStickers("s1", "s2"), "s2")
        assertThat(state.selectedObjectControllers!!.actions).containsExactly(Action.DUPLICATE, Action.DELETE).inOrder()
    }
}
