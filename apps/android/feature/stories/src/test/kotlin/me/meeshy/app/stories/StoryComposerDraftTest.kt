package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryFilter
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
    fun `an empty draft offers the full media allowance and is not full`() {
        val draft = StoryComposerDraft()
        assertThat(draft.remainingMediaSlots).isEqualTo(StoryComposerDraft.MAX_MEDIA)
        assertThat(draft.isMediaFull).isFalse()
        assertThat(draft.isWithinMediaLimit).isTrue()
    }

    @Test
    fun `a partially-filled draft reports the remaining slots`() {
        val draft = StoryComposerDraft(mediaIds = listOf("a", "b", "c"))
        assertThat(draft.remainingMediaSlots).isEqualTo(StoryComposerDraft.MAX_MEDIA - 3)
        assertThat(draft.isMediaFull).isFalse()
    }

    @Test
    fun `a draft at the media cap is full with no remaining slots but still publishable`() {
        val draft = StoryComposerDraft(mediaIds = (1..StoryComposerDraft.MAX_MEDIA).map { "m$it" })
        assertThat(draft.isMediaFull).isTrue()
        assertThat(draft.remainingMediaSlots).isEqualTo(0)
        assertThat(draft.isWithinMediaLimit).isTrue()
        assertThat(draft.canPublish).isTrue()
    }

    @Test
    fun `a draft past the media cap cannot publish and clamps remaining to zero`() {
        val draft = StoryComposerDraft(mediaIds = (1..StoryComposerDraft.MAX_MEDIA + 1).map { "m$it" })
        assertThat(draft.isWithinMediaLimit).isFalse()
        assertThat(draft.remainingMediaSlots).isEqualTo(0)
        assertThat(draft.canPublish).isFalse()
    }

    @Test
    fun `every visibility exposes its gateway wire value`() {
        assertThat(StoryVisibility.PUBLIC.wire).isEqualTo("PUBLIC")
        assertThat(StoryVisibility.FRIENDS.wire).isEqualTo("FRIENDS")
        assertThat(StoryVisibility.COMMUNITY.wire).isEqualTo("COMMUNITY")
        assertThat(StoryVisibility.PRIVATE.wire).isEqualTo("PRIVATE")
    }

    // --- text elements ---

    @Test
    fun `a text-element-only draft with no caption nor media can publish`() {
        val draft = StoryComposerDraft(
            text = "",
            textElements = listOf(StoryTextElement(id = "e1", text = "Salut")),
        )
        assertThat(draft.hasTextElements).isTrue()
        assertThat(draft.canPublish).isTrue()
    }

    @Test
    fun `a draft whose only text element is blank cannot publish`() {
        val draft = StoryComposerDraft(textElements = listOf(StoryTextElement(id = "e1", text = "   ")))
        assertThat(draft.hasTextElements).isFalse()
        assertThat(draft.canPublish).isFalse()
    }

    @Test
    fun `withTextElements returns a new draft preserving text and media`() {
        val original = StoryComposerDraft(text = "cap", mediaIds = listOf("m1"))
        val updated = original.withTextElements(listOf(StoryTextElement(id = "e1", text = "hi")))
        assertThat(updated.textElements.map { it.id }).containsExactly("e1")
        assertThat(updated.text).isEqualTo("cap")
        assertThat(updated.mediaIds).containsExactly("m1")
        assertThat(original.textElements).isEmpty()
    }

    @Test
    fun `toCreateStoryRequest serialises publishable text elements into storyEffects and drops blanks`() {
        val request = StoryComposerDraft(
            text = "",
            textElements = listOf(
                StoryTextElement(id = "e1", text = "Bonjour", style = StoryTextStyle.NEON, x = 0.2f, y = 0.8f),
                StoryTextElement(id = "blank", text = "  "),
            ),
        ).toCreateStoryRequest(originalLanguage = "fr")

        val objects = request.storyEffects?.textObjects.orEmpty()
        assertThat(objects.map { it.id }).containsExactly("e1")
        assertThat(objects.single().text).isEqualTo("Bonjour")
        assertThat(objects.single().textStyle).isEqualTo("neon")
        assertThat(objects.single().sourceLanguage).isEqualTo("fr")
    }

    @Test
    fun `toCreateStoryRequest leaves storyEffects null when no text element is publishable`() {
        val request = StoryComposerDraft(
            text = "caption",
            textElements = listOf(StoryTextElement(id = "blank", text = "")),
        ).toCreateStoryRequest(originalLanguage = "en")
        assertThat(request.storyEffects).isNull()
        assertThat(request.content).isEqualTo("caption")
    }

    @Test
    fun `toCreateStoryRequest carries a selected photo filter and its strength`() {
        val request = StoryComposerDraft(
            text = "hello",
            filter = StoryFilter.VINTAGE,
            filterIntensity = 0.4f,
        ).toCreateStoryRequest(originalLanguage = "en")

        assertThat(request.storyEffects?.filter).isEqualTo("vintage")
        assertThat(request.storyEffects?.filterIntensity).isWithin(1e-4).of(0.4)
    }

    @Test
    fun `a filter-only draft still produces a storyEffects payload`() {
        val request = StoryComposerDraft(
            text = "",
            filter = StoryFilter.BW,
        ).toCreateStoryRequest(originalLanguage = "en")

        assertThat(request.storyEffects).isNotNull()
        assertThat(request.storyEffects?.filter).isEqualTo("bw")
        assertThat(request.storyEffects?.textObjects).isEmpty()
    }

    @Test
    fun `no filter leaves the storyEffects filter fields null`() {
        val request = StoryComposerDraft(
            textElements = listOf(StoryTextElement(id = "e1", text = "hi")),
        ).toCreateStoryRequest(originalLanguage = "en")

        assertThat(request.storyEffects).isNotNull()
        assertThat(request.storyEffects?.filter).isNull()
        assertThat(request.storyEffects?.filterIntensity).isNull()
    }

    @Test
    fun `a clamped strength rides onto the wire`() {
        val request = StoryComposerDraft(
            filter = StoryFilter.WARM,
            filterIntensity = 2.5f,
        ).toCreateStoryRequest(originalLanguage = "en")

        assertThat(request.storyEffects?.filterIntensity).isWithin(1e-4).of(1.0)
    }

    @Test
    fun `toCreateStoryRequest serialises publishable stickers into storyEffects and drops blanks`() {
        val request = StoryComposerDraft(
            text = "",
            stickers = listOf(
                StoryStickerElement(id = "s1", emoji = "🎉", x = 0.2f, y = 0.8f, scale = 1.5f),
                StoryStickerElement(id = "blank", emoji = "  "),
            ),
        ).toCreateStoryRequest(originalLanguage = "fr")

        val objects = request.storyEffects?.stickerObjects.orEmpty()
        assertThat(objects.map { it.id }).containsExactly("s1")
        assertThat(objects.single().emoji).isEqualTo("🎉")
        assertThat(objects.single().scale).isWithin(1e-6).of(1.5)
    }

    @Test
    fun `a sticker-only draft still produces a storyEffects payload`() {
        val request = StoryComposerDraft(
            text = "",
            stickers = listOf(StoryStickerElement(id = "s1", emoji = "😀")),
        ).toCreateStoryRequest(originalLanguage = "en")

        assertThat(request.content).isNull()
        assertThat(request.storyEffects).isNotNull()
        assertThat(request.storyEffects?.stickerObjects).hasSize(1)
        assertThat(request.storyEffects?.textObjects).isEmpty()
    }

    @Test
    fun `no sticker leaves the storyEffects stickerObjects null`() {
        val request = StoryComposerDraft(
            textElements = listOf(StoryTextElement(id = "e1", text = "hi")),
        ).toCreateStoryRequest(originalLanguage = "en")

        assertThat(request.storyEffects).isNotNull()
        assertThat(request.storyEffects?.stickerObjects).isNull()
    }

    @Test
    fun `a sticker-only draft is publishable`() {
        val draft = StoryComposerDraft(
            text = "",
            stickers = listOf(StoryStickerElement(id = "s1", emoji = "😀")),
        )
        assertThat(draft.canPublish).isTrue()
        assertThat(draft.hasStickers).isTrue()
    }

    @Test
    fun `a draft with only a blank sticker is not publishable`() {
        val draft = StoryComposerDraft(
            text = "",
            stickers = listOf(StoryStickerElement(id = "s1", emoji = "  ")),
        )
        assertThat(draft.canPublish).isFalse()
        assertThat(draft.hasStickers).isFalse()
    }
}
