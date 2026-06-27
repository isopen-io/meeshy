package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure story-composer draft: the publish-gating rule
 * ("is this draft sendable?") and the wire-request mapping. No Android, no I/O —
 * exactly the product rule we must get right before the ViewModel/Screen glue.
 */
class StoryComposerDraftTest {

    @Test
    fun `empty draft cannot publish`() {
        assertThat(StoryComposerDraft().canPublish).isFalse()
    }

    @Test
    fun `blank text cannot publish`() {
        assertThat(StoryComposerDraft(text = "   \n\t  ").canPublish).isFalse()
    }

    @Test
    fun `non-blank text can publish`() {
        assertThat(StoryComposerDraft(text = "hello").canPublish).isTrue()
    }

    @Test
    fun `text padded with whitespace can publish and is trimmed`() {
        val draft = StoryComposerDraft(text = "  hi there  ")
        assertThat(draft.canPublish).isTrue()
        assertThat(draft.trimmedText).isEqualTo("hi there")
    }

    @Test
    fun `text at the character limit can publish`() {
        val draft = StoryComposerDraft(text = "a".repeat(StoryComposerDraft.MAX_CHARS))
        assertThat(draft.isWithinLimit).isTrue()
        assertThat(draft.canPublish).isTrue()
    }

    @Test
    fun `text over the character limit cannot publish`() {
        val draft = StoryComposerDraft(text = "a".repeat(StoryComposerDraft.MAX_CHARS + 1))
        assertThat(draft.isWithinLimit).isFalse()
        assertThat(draft.canPublish).isFalse()
    }

    @Test
    fun `charactersRemaining counts down from the limit`() {
        val draft = StoryComposerDraft(text = "abcde")
        assertThat(draft.charactersRemaining).isEqualTo(StoryComposerDraft.MAX_CHARS - 5)
    }

    @Test
    fun `charactersRemaining goes negative past the limit`() {
        val draft = StoryComposerDraft(text = "a".repeat(StoryComposerDraft.MAX_CHARS + 3))
        assertThat(draft.charactersRemaining).isEqualTo(-3)
    }

    @Test
    fun `withText returns a new draft preserving visibility`() {
        val original = StoryComposerDraft(text = "x", visibility = StoryVisibility.FRIENDS)
        val updated = original.withText("y")
        assertThat(updated.text).isEqualTo("y")
        assertThat(updated.visibility).isEqualTo(StoryVisibility.FRIENDS)
        assertThat(original.text).isEqualTo("x")
    }

    @Test
    fun `withVisibility returns a new draft preserving text`() {
        val original = StoryComposerDraft(text = "x", visibility = StoryVisibility.PUBLIC)
        val updated = original.withVisibility(StoryVisibility.PRIVATE)
        assertThat(updated.visibility).isEqualTo(StoryVisibility.PRIVATE)
        assertThat(updated.text).isEqualTo("x")
        assertThat(original.visibility).isEqualTo(StoryVisibility.PUBLIC)
    }

    @Test
    fun `default visibility is PUBLIC`() {
        assertThat(StoryComposerDraft().visibility).isEqualTo(StoryVisibility.PUBLIC)
    }

    @Test
    fun `toCreateStoryRequest maps trimmed content, story type, visibility wire and language`() {
        val request = StoryComposerDraft(text = "  bonjour  ", visibility = StoryVisibility.FRIENDS)
            .toCreateStoryRequest(originalLanguage = "fr")

        assertThat(request.type).isEqualTo("STORY")
        assertThat(request.content).isEqualTo("bonjour")
        assertThat(request.visibility).isEqualTo("FRIENDS")
        assertThat(request.originalLanguage).isEqualTo("fr")
        assertThat(request.storyEffects).isNull()
        assertThat(request.mediaIds).isNull()
        assertThat(request.repostOfId).isNull()
    }

    @Test
    fun `a media-only draft with no text can publish`() {
        val draft = StoryComposerDraft(text = "", mediaIds = listOf("m1"))
        assertThat(draft.hasMedia).isTrue()
        assertThat(draft.canPublish).isTrue()
    }

    @Test
    fun `a media draft with over-limit text cannot publish`() {
        val draft = StoryComposerDraft(text = "a".repeat(StoryComposerDraft.MAX_CHARS + 1), mediaIds = listOf("m1"))
        assertThat(draft.canPublish).isFalse()
    }

    @Test
    fun `an empty draft has no media and cannot publish`() {
        val draft = StoryComposerDraft()
        assertThat(draft.hasMedia).isFalse()
        assertThat(draft.canPublish).isFalse()
    }

    @Test
    fun `withMediaIds returns a new draft preserving text and visibility`() {
        val original = StoryComposerDraft(text = "x", visibility = StoryVisibility.FRIENDS)
        val updated = original.withMediaIds(listOf("a", "b"))
        assertThat(updated.mediaIds).containsExactly("a", "b").inOrder()
        assertThat(updated.text).isEqualTo("x")
        assertThat(updated.visibility).isEqualTo(StoryVisibility.FRIENDS)
        assertThat(original.mediaIds).isEmpty()
    }

    @Test
    fun `toCreateStoryRequest carries non-empty media ids alongside text`() {
        val request = StoryComposerDraft(text = "hi", mediaIds = listOf("m1", "m2"))
            .toCreateStoryRequest(originalLanguage = "en")
        assertThat(request.mediaIds).containsExactly("m1", "m2").inOrder()
        assertThat(request.content).isEqualTo("hi")
    }

    @Test
    fun `toCreateStoryRequest of a media-only draft sends null content and the media ids`() {
        val request = StoryComposerDraft(text = "   ", mediaIds = listOf("m1"))
            .toCreateStoryRequest(originalLanguage = "en")
        assertThat(request.content).isNull()
        assertThat(request.mediaIds).containsExactly("m1")
    }

    @Test
    fun `every visibility exposes its gateway wire value`() {
        assertThat(StoryVisibility.PUBLIC.wire).isEqualTo("PUBLIC")
        assertThat(StoryVisibility.FRIENDS.wire).isEqualTo("FRIENDS")
        assertThat(StoryVisibility.COMMUNITY.wire).isEqualTo("COMMUNITY")
        assertThat(StoryVisibility.PRIVATE.wire).isEqualTo("PRIVATE")
    }
}
