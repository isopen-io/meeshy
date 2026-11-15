package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StorySlidePublishMatter.Facts
import me.meeshy.sdk.model.composer.ComposerFormat.POST
import me.meeshy.sdk.model.composer.ComposerFormat.REEL
import me.meeshy.sdk.model.composer.ComposerFormat.STATUS
import me.meeshy.sdk.model.composer.ComposerFormat.STORY
import org.junit.Test

class ComposerStoryCanvasSeedTest {
    private val empty = Facts()

    @Test
    fun `story post and reel always show their scene, even empty`() {
        listOf(STORY, POST, REEL).forEach {
            assertThat(ComposerStoryCanvas.showsCanvas(it, documentHasScene = false)).isTrue()
        }
    }

    @Test
    fun `mood shows a scene only when the document already has one`() {
        assertThat(ComposerStoryCanvas.showsCanvas(STATUS, documentHasScene = false)).isFalse()
        assertThat(ComposerStoryCanvas.showsCanvas(STATUS, documentHasScene = true)).isTrue()
    }

    @Test
    fun `a story always publishes its canvases while a text-only post does not publish a scene`() {
        assertThat(ComposerStoryCanvas.publishesScene(STORY, documentHasScene = false)).isTrue()
        assertThat(ComposerStoryCanvas.publishesScene(POST, documentHasScene = false)).isFalse()
        assertThat(ComposerStoryCanvas.publishesScene(POST, documentHasScene = true)).isTrue()
    }

    @Test
    fun `only a story with no slide at all needs a seed slide`() {
        assertThat(ComposerStoryCanvas.needsSeedSlide(STORY, 0)).isTrue()
        assertThat(ComposerStoryCanvas.needsSeedSlide(STORY, 1)).isFalse()
        assertThat(ComposerStoryCanvas.needsSeedSlide(POST, 0)).isFalse()
    }

    @Test
    fun `the seeded empty slide is never publishable matter`() {
        ComposerFormat.entries.forEach {
            assertThat(ComposerStoryCanvas.hasPublishableCanvas(it, listOf(empty))).isFalse()
        }
    }

    @Test
    fun `a chosen background alone publishes a story but not a post`() {
        val painted = listOf(Facts(hasChosenBackground = true))
        assertThat(ComposerStoryCanvas.hasPublishableCanvas(STORY, painted)).isTrue()
        assertThat(ComposerStoryCanvas.hasPublishableCanvas(POST, painted)).isFalse()
        assertThat(ComposerStoryCanvas.hasPublishableCanvas(REEL, painted)).isFalse()
    }

    @Test
    fun `an object on any slide publishes every format`() {
        val onSecondSlide = listOf(empty, Facts(realTextObjects = 1))
        listOf(STORY, POST, REEL, STATUS).forEach {
            assertThat(ComposerStoryCanvas.hasPublishableCanvas(it, onSecondSlide)).isTrue()
        }
    }

    @Test
    fun `a caption alone publishes a story but is not an object`() {
        val captioned = listOf(Facts(caption = "salut"))
        assertThat(ComposerStoryCanvas.hasPublishableCanvas(STORY, captioned)).isTrue()
        assertThat(ComposerStoryCanvas.hasPublishableCanvas(POST, captioned)).isFalse()
    }

    @Test
    fun `a background media, a place or a sound count as objects`() {
        listOf(Facts(hasBackgroundMedia = true), Facts(placeCount = 1), Facts(soundCount = 1)).forEach {
            assertThat(ComposerStoryCanvas.hasPublishableCanvas(POST, listOf(it))).isTrue()
        }
    }
}
