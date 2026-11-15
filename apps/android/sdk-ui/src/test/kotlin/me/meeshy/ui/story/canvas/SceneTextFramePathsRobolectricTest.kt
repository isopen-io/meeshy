package me.meeshy.ui.story.canvas

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.scene.StoryTextFrameGeometry
import me.meeshy.sdk.model.scene.StoryTextFrameShape
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SceneTextFramePathsRobolectricTest {
    private val drawn = StoryTextFrameShape.entries.filter { it != StoryTextFrameShape.NONE }

    @Test
    fun `every drawn frame yields a non empty path within its box`() {
        drawn.forEach { shape ->
            val bounds = sceneTextFramePath(shape, 600f, 400f, 2f).getBounds()
            assertThat(bounds.isEmpty).isFalse()
            assertThat(bounds.left).isAtLeast(-0.5f)
            assertThat(bounds.right).isAtMost(600.5f)
            assertThat(bounds.bottom).isAtMost(400.5f)
        }
    }

    @Test
    fun `only the diamond, the cloud and the speech bubble use a custom path`() {
        assertThat(StoryTextFrameShape.entries.filter { it.usesCustomPath })
            .containsExactly(StoryTextFrameShape.DIAMOND, StoryTextFrameShape.CLOUD, StoryTextFrameShape.SPEECH)
    }

    @Test
    fun `the speech tail reaches the bottom of the box below the body`() {
        val bounds = sceneTextFramePath(StoryTextFrameShape.SPEECH, 600f, 400f, 2f).getBounds()
        val bodyBottom = 400f - StoryTextFrameGeometry.SPEECH_TAIL_HEIGHT.toFloat() * 2f
        assertThat(bounds.bottom).isWithin(0.5f).of(400f)
        assertThat(bounds.bottom).isGreaterThan(bodyBottom)
    }

    @Test
    fun `a degenerate scale draws nothing instead of throwing`() {
        assertThat(sceneTextFramePath(StoryTextFrameShape.CLOUD, 100f, 100f, 0f).isEmpty).isTrue()
    }
}
