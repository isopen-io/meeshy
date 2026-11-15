package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StickerAnimation
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StickerMotionFilterTest {

    private fun plan(lists: SceneLists) =
        SceneRenderPlanner.plan(lists, 0.0, SceneRenderMode.PLAY, SceneReaderLanguages.NONE)

    @Test
    fun `seuls les stickers a mouvement connu sont retenus`() {
        val items = plan(
            SceneLists(
                texts = listOf(StoryTextObject(id = "t", text = "x")),
                stickers = listOf(
                    StorySticker(id = "a", emoji = "🔥", animation = "pulse"),
                    StorySticker(id = "b", emoji = "🎈"),
                    StorySticker(id = "c", emoji = "⭐", animation = "inconnu-futur"),
                    StorySticker(id = "d", emoji = "💥", animation = "shake"),
                ),
            ),
        )
        assertThat(StickerMotionFilter.animated(items).map { it.id }).containsExactly("a", "d")
        assertThat(StickerMotionFilter.animation(items.first { it.id == "a" })).isEqualTo(StickerAnimation.PULSE)
    }

    @Test
    fun `une scene sans mouvement ne coute rien`() {
        val items = plan(SceneLists(stickers = listOf(StorySticker(id = "b", emoji = "🎈"))))
        assertThat(StickerMotionFilter.animated(items)).isEmpty()
        assertThat(StickerMotionFilter.hasMotion(items)).isFalse()
    }
}
