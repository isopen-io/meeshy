package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.composer.ComposerFormat.POST
import me.meeshy.sdk.model.composer.ComposerFormat.REEL
import me.meeshy.sdk.model.composer.ComposerFormat.STATUS
import me.meeshy.sdk.model.composer.ComposerFormat.STORY
import org.junit.Test

class PublishCapsuleStateTest {
    private fun capsule(
        chosen: ComposerPublishChoice? = null,
        door: ComposerFormat = STORY,
        candidates: List<ComposerFormat> = listOf(STORY, POST, REEL),
        offered: List<ComposerFormat> = candidates,
        slides: Int = 1,
        publishing: Boolean = false,
        editing: Boolean = false,
    ) = PublishCapsuleState.of(chosen, door, candidates, offered, true, slides, true, isPublishing = publishing, editing = editing)

    @Test
    fun `the main part names the door format until the chevron arms another`() {
        assertThat(capsule().title).isEqualTo(StoryPublishTitle.Single)
        assertThat(capsule(door = POST).title).isEqualTo(StoryPublishTitle.Post)
        assertThat(capsule(chosen = ComposerPublishChoice.of(REEL, null)).title).isEqualTo(StoryPublishTitle.Reel)
    }

    @Test
    fun `arming through the chevron does not publish and a stale choice falls back on the door`() {
        val armed = capsule().toggling(POST)
        assertThat(armed.formats).containsExactly(POST, STORY).inOrder()
        assertThat(capsule(chosen = ComposerPublishChoice.of(REEL, null), offered = listOf(STORY, POST)).armed)
            .isEqualTo(ComposerPublishChoice.of(STORY, null))
    }

    @Test
    fun `story and reel on one scene is named as one gesture`() {
        val c = capsule(chosen = ComposerPublishChoice.ofFormats(listOf(STORY, REEL), null))
        assertThat(c.title).isEqualTo(StoryPublishTitle.StoryAndReel)
        assertThat(capsule(slides = 2, chosen = ComposerPublishChoice.ofFormats(listOf(STORY, REEL), null)).title).isEqualTo(StoryPublishTitle.Many(2))
    }

    @Test
    fun `the chevron is absent when a single gesture would be offered`() {
        val mood = capsule(door = STATUS, candidates = listOf(STATUS), offered = listOf(STATUS))
        assertThat(mood.showsChevron).isFalse()
        assertThat(mood.title).isNull()
        assertThat(capsule().showsChevron).isTrue()
    }

    @Test
    fun `the chevron freezes only while publishing, and a rewritten publication saves`() {
        assertThat(capsule().chevronEnabled).isTrue()
        assertThat(capsule(publishing = true).chevronEnabled).isFalse()
        assertThat(capsule(editing = true).title).isEqualTo(StoryPublishTitle.Save)
    }

    @Test
    fun `post of several scenes unfolds the layouts and choosing one arms the post`() {
        val c = capsule(door = POST, slides = 3)
        val post = c.menu!!.first { it.format == POST }
        assertThat(post.layouts).hasSize(5)
        assertThat(c.choosingLayout(MosaicLayoutMode.WAVE).layout).isEqualTo(MosaicLayoutMode.WAVE)
    }
}
