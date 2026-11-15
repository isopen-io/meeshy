package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ReelComposition.MediaKind
import me.meeshy.sdk.model.composer.ComposerFormat.POST
import me.meeshy.sdk.model.composer.ComposerFormat.REEL
import me.meeshy.sdk.model.composer.ComposerFormat.STATUS
import me.meeshy.sdk.model.composer.ComposerFormat.STORY
import org.junit.Test

/**
 * #13919 — le choix du format est COMPOSITE, jamais exclusif (décision porteur du 2026-10-31, R2 de
 * `2026-10-31-un-seul-compositeur-design.md`) : l'auteur coche un ou plusieurs formats parmi Story, Post et Réel, jamais
 * zéro, et un seul geste les publie tous. Chaque format garde ses refus ; la scène suit le premier format coché.
 */
class ComposerHostStateFormatsTest {
    private fun open(origin: ComposerOrigin) = ComposerHostState.open(ComposerIntent(origin))

    private val video = MediaKind("video/mp4", 5_000)

    @Test
    fun `a fresh document publishes its door's format alone`() {
        assertThat(open(ComposerOrigin.FeedComposer).publishedFormats).containsExactly(POST)
        assertThat(open(ComposerOrigin.StoryTray).publishedFormats).containsExactly(STORY)
    }

    @Test
    fun `checking a second format publishes both, in the menu's order, the scene staying on the first`() {
        val feed = open(ComposerOrigin.FeedComposer).toggle(STORY)
        val tray = open(ComposerOrigin.StoryTray).toggle(POST)

        assertThat(feed.publishedFormats).containsExactly(POST, STORY).inOrder()
        assertThat(feed.selectedFormat).isEqualTo(POST)
        assertThat(tray.publishedFormats).containsExactly(STORY, POST).inOrder()
        assertThat(tray.selectedFormat).isEqualTo(STORY)
    }

    @Test
    fun `the three formats are cumulable once the composition qualifies as a reel`() {
        val all = open(ComposerOrigin.StoryTray).withMedia(listOf(video)).toggle(REEL).toggle(POST)

        assertThat(all.publishedFormats).containsExactly(STORY, POST, REEL).inOrder()
    }

    @Test
    fun `the last checked format cannot be unchecked, never zero`() {
        val alone = open(ComposerOrigin.FeedComposer)

        assertThat(alone.toggle(POST).publishedFormats).containsExactly(POST)
    }

    @Test
    fun `unchecking the first format lets the scene follow the next one`() {
        val both = open(ComposerOrigin.FeedComposer).toggle(STORY)

        val storyOnly = both.toggle(POST)

        assertThat(storyOnly.publishedFormats).containsExactly(STORY)
        assertThat(storyOnly.selectedFormat).isEqualTo(STORY)
    }

    @Test
    fun `a refused format cannot be checked, and one the offer withdraws stops publishing`() {
        val noVideo = open(ComposerOrigin.FeedComposer)
        assertThat(noVideo.toggle(REEL).publishedFormats).containsExactly(POST)

        val withReel = noVideo.withMedia(listOf(video)).toggle(REEL)
        assertThat(withReel.publishedFormats).containsExactly(POST, REEL).inOrder()
        assertThat(withReel.withMedia(emptyList()).publishedFormats).containsExactly(POST)
    }

    @Test
    fun `the mood stays exclusive - checking it replaces the scene formats, leaving it gives one back`() {
        val text = open(ComposerOrigin.FeedComposer).withText("bonjour").toggle(STORY)

        val mood = text.toggle(STATUS)
        assertThat(mood.publishedFormats).containsExactly(STATUS)

        assertThat(mood.toggle(POST).publishedFormats).containsExactly(POST)
    }

    @Test
    fun `an edited publication keeps one format`() {
        val edit = open(ComposerOrigin.Edit(postId = "p", documentFormat = REEL)).toggle(POST)

        assertThat(edit.publishedFormats).containsExactly(POST)
    }

    @Test
    fun `a reopened draft restores its formats, filtered by what the door offers`() {
        val restored = open(ComposerOrigin.FeedComposer).restore(listOf(STORY, POST, REEL))

        assertThat(restored.publishedFormats).containsExactly(POST, STORY).inOrder()
        assertThat(open(ComposerOrigin.FeedComposer).restore(emptyList()).publishedFormats).containsExactly(POST)
    }

    @Test
    fun `switching to one format with choose clears the other checks`() {
        val both = open(ComposerOrigin.FeedComposer).toggle(STORY)

        assertThat(both.choose(STORY).publishedFormats).containsExactly(STORY)
    }

    @Test
    fun `the capsule names every checked format`() {
        assertThat(StoryPublishTitle.of(listOf(STORY, POST), slideCount = 2)).isEqualTo(StoryPublishTitle.StoryAndPost)
        assertThat(StoryPublishTitle.of(listOf(POST, STORY), slideCount = 2)).isEqualTo(StoryPublishTitle.StoryAndPost)
        assertThat(StoryPublishTitle.of(listOf(STORY, REEL), slideCount = 1)).isEqualTo(StoryPublishTitle.StoryAndReel)
        assertThat(StoryPublishTitle.of(listOf(POST, REEL), slideCount = 1)).isEqualTo(StoryPublishTitle.PostAndReel)
        assertThat(StoryPublishTitle.of(listOf(STORY, POST, REEL), slideCount = 1)).isEqualTo(StoryPublishTitle.StoryPostAndReel)
        assertThat(StoryPublishTitle.of(listOf(STORY), slideCount = 3)).isEqualTo(StoryPublishTitle.Many(3))
        assertThat(StoryPublishTitle.of(listOf(POST, STORY), slideCount = 1, editing = true)).isEqualTo(StoryPublishTitle.Save)
    }
}
