package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostDetailSceneFramingTest {
    private val ratio = SceneShape.ASPECT.toFloat()

    private fun page(w: Float, h: Float, top: Float? = null) = PostDetailSceneFraming.Measures(w, h, top)

    @Test
    fun `small phone - the scene is bounded so the actions row stays visible above the composer`() {
        val size = PostDetailSceneFraming.sceneSize(ratio, page(360f, 560f, top = 120f))!!
        assertThat(size.height + 120f + PostDetailSceneFraming.ACTIONS_ROW_RESERVE).isAtMost(560f + 0.01f)
        assertThat(size.width / size.height).isWithin(0.001f).of(ratio)
    }

    @Test
    fun `tall phone - the scene takes the full 9 by 16 reading width and never exceeds the max width`() {
        val size = PostDetailSceneFraming.sceneSize(ratio, page(900f, 3000f))!!
        assertThat(size.width).isEqualTo(PostDetailSceneFraming.MAX_WIDTH)
    }

    @Test
    fun `too low a scene top gives back the reading size instead of an unreadable thumbnail`() {
        val reading = PostDetailSceneFraming.sceneSize(ratio, page(360f, 700f))!!
        val low = PostDetailSceneFraming.sceneSize(ratio, page(360f, 700f, top = 640f))!!
        assertThat(low).isEqualTo(reading)
    }

    @Test
    fun `an unmeasured page gives no size`() {
        assertThat(PostDetailSceneFraming.sceneSize(ratio, page(0f, 0f))).isNull()
        assertThat(PostDetailSceneFraming.sceneSize(0f, page(360f, 700f))).isNull()
    }

    @Test
    fun `the keyboard does not shrink the scene but growth and width changes are recorded`() {
        val base = page(360f, 700f)
        assertThat(base.recordingViewport(360f, 300f, composerIsFocused = true)).isEqualTo(base)
        assertThat(base.recordingViewport(360f, 300f, composerIsFocused = false).viewportHeight).isEqualTo(300f)
        assertThat(base.recordingViewport(360f, 800f, composerIsFocused = true).viewportHeight).isEqualTo(800f)
        assertThat(base.recordingViewport(800f, 300f, composerIsFocused = true).viewportWidth).isEqualTo(800f)
        assertThat(page(0f, 0f).recordingViewport(360f, 300f, composerIsFocused = true).viewportHeight).isEqualTo(300f)
    }

    @Test
    fun `tablet - width is capped and the height follows the ratio`() {
        val size = PostDetailSceneFraming.sceneSize(ratio, page(1024f, 1300f, top = 100f))!!
        assertThat(size.width).isAtMost(PostDetailSceneFraming.MAX_WIDTH)
        assertThat(size.width / size.height).isWithin(0.001f).of(ratio)
    }

    @Test
    fun `the scene top is recorded at rest only`() {
        val base = page(360f, 700f)
        assertThat(base.recordingSceneTop(150.4f, scrollOffset = 40f)).isEqualTo(base)
        assertThat(base.recordingSceneTop(150.4f, scrollOffset = 0f).sceneTop).isEqualTo(150f)
    }

    @Test
    fun `mute and pause rules - the button needs a rendered canvas with sound, off screen pauses`() {
        assertThat(PostDetailScenePlayback.showsSoundControls(rendered = false, offersSound = true)).isFalse()
        assertThat(PostDetailScenePlayback.showsSoundControls(rendered = true, offersSound = false)).isFalse()
        assertThat(PostDetailScenePlayback.showsSoundControls(rendered = true, offersSound = true)).isTrue()
        assertThat(PostDetailScenePlayback.isVisible(900f, 1500f, 0f, 800f)).isFalse()
        assertThat(PostDetailScenePlayback.isVisible(700f, 1500f, 0f, 800f)).isTrue()
        assertThat(PostDetailScenePlayback.isVisible(0f, 1f, null, null)).isTrue()
        assertThat(PostDetailScenePlayback.isPaused(visible = false, viewerPaused = false)).isTrue()
        assertThat(PostDetailScenePlayback.isPaused(visible = true, viewerPaused = true)).isTrue()
        assertThat(PostDetailScenePlayback.isPaused(visible = true, viewerPaused = false)).isFalse()
    }
}
