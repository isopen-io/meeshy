package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedPlace
import org.junit.Test

class StoryCommentAttachmentsDraftTest {

    private val photo = StoryCommentPiece("p1", "/cache/p1", "p1.jpg", "image/jpeg", uploadedId = "srv-1")
    private val place = SharedPlace(latitude = 48.85, longitude = 2.35, name = "Paris")

    @Test
    fun `a draft with only a piece is a draft`() {
        val drafts = StoryCommentDrafts().saved("s1", "", pieces = listOf(photo))
        assertThat(drafts.draftOf("s1")?.pieces).containsExactly(photo)
    }

    @Test
    fun `a draft with only a place is a draft`() {
        val drafts = StoryCommentDrafts().saved("s1", "", place = place)
        assertThat(drafts.draftOf("s1")?.place).isEqualTo(place)
    }

    @Test
    fun `nothing left clears the draft`() {
        val drafts = StoryCommentDrafts().saved("s1", "x", pieces = listOf(photo)).saved("s1", "")
        assertThat(drafts.draftOf("s1")).isNull()
    }

    @Test
    fun `pieces survive per story and a send deletes them`() {
        val drafts = StoryCommentDrafts().saved("s1", "a", pieces = listOf(photo)).saved("s2", "b")
        assertThat(drafts.draftOf("s2")?.pieces).isEmpty()
        assertThat(drafts.sent("s1").draftOf("s1")).isNull()
    }

    @Test
    fun `a refused comment returns with its pieces and place`() {
        val drafts = StoryCommentDrafts().refused("s1", "salut", 42L, pieces = listOf(photo), place = place)
        val draft = drafts.draftOf("s1")!!
        assertThat(draft.text).isEqualTo("salut")
        assertThat(draft.refusedAt).isEqualTo(42L)
        assertThat(draft.pieces).containsExactly(photo)
        assertThat(draft.place).isEqualTo(place)
    }

    @Test
    fun `a refused comment keeps what was typed meanwhile`() {
        val typed = StoryCommentPiece("p2", "/cache/p2", "p2.jpg", "image/jpeg")
        val drafts = StoryCommentDrafts().saved("s1", "tapé", pieces = listOf(typed)).refused("s1", "refusé", 1L, pieces = listOf(photo))
        val draft = drafts.draftOf("s1")!!
        assertThat(draft.text).isEqualTo("refusé\ntapé")
        assertThat(draft.pieces.map { it.id }).containsExactly("p1")
    }

    @Test
    fun `the composer state sends with media and no text, and not while uploading`() {
        val empty = StoryCommentComposerState(storyAccentHex = "#6366F1")
        assertThat(empty.canSend("  ")).isFalse()
        val uploading = empty.copy(attachments = StoryCommentAttachmentTray().adding(photo.copy(uploadedId = null)))
        assertThat(uploading.canSend("")).isFalse()
        val ready = empty.copy(attachments = StoryCommentAttachmentTray().adding(photo))
        assertThat(ready.canSend("")).isTrue()
        assertThat(empty.copy(place = place).canSend("")).isTrue()
    }

    @Test
    fun `a send consumes the pieces and the place`() {
        val state = StoryCommentComposerState("#6366F1", attachments = StoryCommentAttachmentTray().adding(photo), place = place)
        val sent = state.sent()
        assertThat(sent.attachments.hasMedia).isFalse()
        assertThat(sent.place).isNull()
    }

    @Test
    fun `a refused draft restores its pieces into the composer`() {
        val draft = StoryCommentDraft("t", 5L, listOf(photo), place)
        val restored = StoryCommentComposerState("#6366F1").restoring(draft)
        assertThat(restored.attachments.attachmentIds).containsExactly("srv-1")
        assertThat(restored.place).isEqualTo(place)
    }
}
