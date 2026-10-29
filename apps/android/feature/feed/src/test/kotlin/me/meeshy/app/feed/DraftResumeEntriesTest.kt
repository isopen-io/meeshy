package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PostComposerDraftSnapshot
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test

class DraftResumeEntriesTest {

    private fun post(text: String = "salut", at: Long = 1_000L, media: Int = 0) = PostComposerDraftSnapshot(
        text = text,
        media = List(media) { UploadedMedia("m$it", "", "", 0L, null, null, null, null) },
        updatedAtMillis = at,
    )

    private fun story(text: String = "yo", at: String? = "2026-10-28T10:00:00Z", awaiting: List<String> = emptyList()) =
        StoryComposerDraftSnapshot(
            slides = listOf(
                StoryDraftSlideSnapshot(id = "s1", text = ""),
                StoryDraftSlideSnapshot(id = "s2", text = text, mediaIds = listOf("m1", "m2")),
            ),
            selectedId = "s1",
            updatedAt = at,
            awaitingPublication = awaiting,
        )

    @Test
    fun `no draft, nothing to offer`() {
        assertThat(DraftResumeEntries.from(null, null)).isEmpty()
        assertThat(DraftResumeEntries.from(PostComposerDraftSnapshot(), StoryComposerDraftSnapshot())).isEmpty()
    }

    @Test
    fun `a post draft shows its words, trimmed, and its media`() {
        val entry = DraftResumeEntries.from(post(text = "  bonjour  ", media = 2), null).single()

        assertThat(entry.kind).isEqualTo(DraftResumeKind.POST)
        assertThat(entry.text).isEqualTo("bonjour")
        assertThat(entry.mediaCount).isEqualTo(2)
    }

    @Test
    fun `a post draft of media alone has no text to show`() {
        assertThat(DraftResumeEntries.from(post(text = " ", media = 1), null).single().text).isNull()
    }

    @Test
    fun `a story draft shows its first written slide and all its media`() {
        val entry = DraftResumeEntries.from(null, story()).single()

        assertThat(entry.kind).isEqualTo(DraftResumeKind.STORY)
        assertThat(entry.text).isEqualTo("yo")
        assertThat(entry.mediaCount).isEqualTo(2)
    }

    @Test
    fun `a story draft already on its way is not a draft to resume`() {
        assertThat(DraftResumeEntries.from(null, story(awaiting = listOf("cmid_1")))).isEmpty()
    }

    @Test
    fun `the most recently touched draft comes first`() {
        val older = post(at = Instant("2026-10-28T09:00:00Z"))
        val entries = DraftResumeEntries.from(older, story(at = "2026-10-28T10:00:00Z"))

        assertThat(entries.map { it.kind }).containsExactly(DraftResumeKind.STORY, DraftResumeKind.POST).inOrder()
    }

    @Test
    fun `a story stamp that cannot be read sorts last instead of failing`() {
        val entries = DraftResumeEntries.from(post(at = 5L), story(at = "n'importe quoi"))

        assertThat(entries.map { it.kind }).containsExactly(DraftResumeKind.POST, DraftResumeKind.STORY).inOrder()
    }

    private fun media(mime: String, durationMs: Long? = null) = UploadedMedia("m-$mime", "", mime, 0L, null, null, durationMs, null)

    @Test
    fun `a post draft whose composition is a reel is offered as a reel, and what the author forced to a plain post is not`() {
        val video = PostComposerDraftSnapshot(media = listOf(media("video/mp4", durationMs = 12_000L)), updatedAtMillis = 1L)
        val twoImages = PostComposerDraftSnapshot(media = listOf(media("image/jpeg"), media("image/jpeg")), updatedAtMillis = 1L)
        val oneImage = PostComposerDraftSnapshot(media = listOf(media("image/jpeg")), updatedAtMillis = 1L)

        assertThat(DraftResumeEntries.from(video, null).single().kind).isEqualTo(DraftResumeKind.REEL)
        assertThat(DraftResumeEntries.from(twoImages, null).single().kind).isEqualTo(DraftResumeKind.REEL)
        assertThat(DraftResumeEntries.from(video.copy(forcePlainPost = true), null).single().kind).isEqualTo(DraftResumeKind.POST)
        assertThat(DraftResumeEntries.from(oneImage, null).single().kind).isEqualTo(DraftResumeKind.POST)
    }

    @Test
    fun `a reel draft sorts with the others by the moment it was touched`() {
        val reel = PostComposerDraftSnapshot(media = listOf(media("video/mp4", 5_000L)), updatedAtMillis = Instant("2026-10-28T11:00:00Z"))

        val entries = DraftResumeEntries.from(reel, story(at = "2026-10-28T10:00:00Z"))

        assertThat(entries.map { it.kind }).containsExactly(DraftResumeKind.REEL, DraftResumeKind.STORY).inOrder()
    }

    private fun Instant(iso: String): Long = java.time.Instant.parse(iso).toEpochMilli()
}
