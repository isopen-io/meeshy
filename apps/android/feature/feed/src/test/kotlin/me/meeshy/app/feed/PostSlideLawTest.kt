package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.DescriptionTarget
import org.junit.Test

/** In a post a slide IS a media (iOS `MeeshyComposerHost+Intake`): the rail's tiles are the attached media. */
class PostSlideLawTest {
    private val ids = listOf("a", "b", "c")

    @Test
    fun `the current slide is the selected one, else the first`() {
        assertThat(PostSlideLaw.current(ids, "b")).isEqualTo("b")
        assertThat(PostSlideLaw.current(ids, null)).isEqualTo("a")
        assertThat(PostSlideLaw.current(ids, "gone")).isEqualTo("a")
        assertThat(PostSlideLaw.current(emptyList(), "a")).isNull()
    }

    @Test
    fun `removing the current slide hands the selection to the one that takes its place`() {
        assertThat(PostSlideLaw.selectionAfterRemoval(ids, removed = "b", current = "b")).isEqualTo("c")
        assertThat(PostSlideLaw.selectionAfterRemoval(ids, removed = "c", current = "c")).isEqualTo("b")
        assertThat(PostSlideLaw.selectionAfterRemoval(listOf("a"), removed = "a", current = "a")).isNull()
    }

    @Test
    fun `removing another slide keeps the current one`() {
        assertThat(PostSlideLaw.selectionAfterRemoval(ids, removed = "a", current = "c")).isEqualTo("c")
    }

    @Test
    fun `the rail stands as soon as a media is attached, and not before`() {
        assertThat(PostSlideLaw.showsRail(0)).isFalse()
        assertThat(PostSlideLaw.showsRail(1)).isTrue()
    }

    @Test
    fun `a lone tile leads nowhere but still carries the bin, the only way to remove it from a post`() {
        assertThat(PostSlideLaw.tilesNavigate(1)).isFalse()
        assertThat(PostSlideLaw.tilesNavigate(2)).isTrue()
        assertThat(PostSlideLaw.showsDelete(index = 0, currentIndex = 0, count = 1)).isTrue()
        assertThat(PostSlideLaw.showsDelete(index = 1, currentIndex = 0, count = 3)).isFalse()
        assertThat(PostSlideLaw.showsDelete(index = 2, currentIndex = 2, count = 3)).isTrue()
    }

    @Test
    fun `the caption field exists for a post with a media on the slide only`() {
        assertThat(PostSlideLaw.captionTarget(ComposerFormat.POST, "b")).isEqualTo(DescriptionTarget.MediaCaption("b"))
        assertThat(PostSlideLaw.captionMedia(ComposerFormat.POST, "b")).isEqualTo("b")
        assertThat(PostSlideLaw.captionMedia(ComposerFormat.POST, null)).isNull()
        assertThat(PostSlideLaw.captionMedia(ComposerFormat.REEL, "b")).isNull()
    }
}
