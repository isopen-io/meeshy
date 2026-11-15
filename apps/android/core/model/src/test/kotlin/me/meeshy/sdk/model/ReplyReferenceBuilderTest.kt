package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReplyReferenceBuilderTest {
    private fun message(
        replyTo: ApiMessageReplyPreview? = null,
        postReplyTo: ApiPostReplyTarget? = null,
        storyReplyToId: String? = null,
    ) = ApiMessage(id = "m", conversationId = "c", replyTo = replyTo, postReplyTo = postReplyTo, storyReplyToId = storyReplyToId)

    private fun translation(language: String, text: String) =
        ApiTextTranslation(targetLanguage = language, translatedContent = text)

    @Test
    fun `a mood reply keeps emoji content and date`() {
        val reference = ReplyReferenceBuilder.build(
            message(postReplyTo = ApiPostReplyTarget(id = "p", moodEmoji = " 😀 ", previewText = " Heureux ", createdAt = "2026-10-01T10:00:00Z")),
            emptyList(),
        )!!
        assertThat(reference.kind).isEqualTo(EngravedReply.Kind.MOOD)
        assertThat(reference.moodEmoji).isEqualTo("😀")
        assertThat(reference.previewText).isEqualTo("Heureux")
        assertThat(reference.publishedAtIso).isEqualTo("2026-10-01T10:00:00Z")
    }

    @Test
    fun `a story reply keeps preview and counters`() {
        val reference = ReplyReferenceBuilder.build(
            message(postReplyTo = ApiPostReplyTarget(id = "p", previewText = "Plage", reactionCount = 3, commentCount = 2, shareCount = 1, thumbnailUrl = "t.jpg")),
            emptyList(),
        )!!
        assertThat(reference.kind).isEqualTo(EngravedReply.Kind.STORY)
        assertThat(listOf(reference.reactionCount, reference.commentCount, reference.shareCount)).containsExactly(3, 2, 1).inOrder()
        assertThat(reference.thumbnailUrl).isEqualTo("t.jpg")
    }

    @Test
    fun `a withdrawn post, or a bare story id, is unavailable`() {
        assertThat(ReplyReferenceBuilder.build(message(postReplyTo = ApiPostReplyTarget(id = "p", unavailable = true)), emptyList())!!.isUnavailable).isTrue()
        val bare = ReplyReferenceBuilder.build(message(storyReplyToId = "s"), emptyList())!!
        assertThat(bare.targetId).isEqualTo("s")
        assertThat(bare.isUnavailable).isTrue()
        assertThat(ReplyReferenceBuilder.build(message(), emptyList())).isNull()
    }

    @Test
    fun `a quoted message is served by the ordered prism at the rank it matches, not the first rank`() {
        val quote = ApiMessageReplyPreview(
            id = "q", content = "Hello", originalLanguage = "en",
            translations = listOf(translation("es", "Hola")),
        )
        val reference = ReplyReferenceBuilder.build(message(replyTo = quote), listOf("fr", "es", "en"))!!
        assertThat(reference.previewText).isEqualTo("Hola")
        assertThat(reference.servedLanguage).isEqualTo("es")
    }

    @Test
    fun `without a matching rank the original is served and nothing falls back to the first translation`() {
        val quote = ApiMessageReplyPreview(id = "q", content = "Hello", originalLanguage = "en", translations = listOf(translation("de", "Hallo")))
        val reference = ReplyReferenceBuilder.build(message(replyTo = quote), listOf("fr"))!!
        assertThat(reference.previewText).isEqualTo("Hello")
        assertThat(reference.servedLanguage).isNull()
    }

    @Test
    fun `a protected quoted message never republishes its text`() {
        val quote = ApiMessageReplyPreview(id = "q", content = "secret", isViewOnce = true, translations = listOf(translation("fr", "secret")))
        assertThat(ReplyReferenceBuilder.build(message(replyTo = quote), listOf("fr"))!!.previewText).isEmpty()
    }

    @Test
    fun `engraving fills only an empty slot and leaves a rich snapshot alone`() {
        val bare = ReplyReferenceBuilder.engrave(message(storyReplyToId = "s"))
        assertThat(bare.postReplyTo).isEqualTo(ApiPostReplyTarget(id = "s", unavailable = true))
        val rich = message(postReplyTo = ApiPostReplyTarget(id = "s", previewText = "ok"), storyReplyToId = "s")
        assertThat(ReplyReferenceBuilder.engrave(rich)).isSameInstanceAs(rich)
        val untouched = message()
        assertThat(ReplyReferenceBuilder.engrave(untouched)).isSameInstanceAs(untouched)
    }
}
