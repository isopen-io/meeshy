package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure text-only feed-post composer draft — the Android
 * SSOT for the "texte seul" first sub-slice of the Feed composer (port of the
 * text-input surface of iOS `FeedView.composerOverlay`: `composerText` +
 * `postVisibility`). It owns the single publish rule (non-blank trimmed text —
 * attachments are a documented, deferred follow-up), the body actually sent, and
 * the visibility transition, so the Composable stays glue and the rules are
 * fully unit-tested.
 */
class FeedComposerDraftTest {

    // --- publish gate -----------------------------------------------------

    @Test
    fun `a fresh draft has empty text and cannot be published`() {
        val draft = FeedComposerDraft()

        assertThat(draft.text).isEmpty()
        assertThat(draft.canPublish).isFalse()
    }

    @Test
    fun `typing non-blank text enables publishing`() {
        val draft = FeedComposerDraft().withText("hello world")

        assertThat(draft.canPublish).isTrue()
    }

    @Test
    fun `whitespace-only text cannot publish`() {
        val draft = FeedComposerDraft().withText("   \n\t  ")

        assertThat(draft.canPublish).isFalse()
    }

    @Test
    fun `clearing the text back to empty disables publishing again`() {
        val draft = FeedComposerDraft().withText("hello").withText("")

        assertThat(draft.canPublish).isFalse()
    }

    // --- body actually sent -------------------------------------------------

    @Test
    fun `trimmedContent strips surrounding whitespace`() {
        val draft = FeedComposerDraft().withText("  hello world  ")

        assertThat(draft.trimmedContent).isEqualTo("hello world")
    }

    @Test
    fun `trimmedContent is empty for blank or empty text`() {
        assertThat(FeedComposerDraft().withText("   ").trimmedContent).isEmpty()
        assertThat(FeedComposerDraft().withText("").trimmedContent).isEmpty()
    }

    // --- visibility -----------------------------------------------------------

    @Test
    fun `a fresh draft defaults to public visibility`() {
        assertThat(FeedComposerDraft().visibility).isEqualTo(FeedPostVisibility.PUBLIC)
    }

    @Test
    fun `changing visibility carries the wire value the gateway expects`() {
        val draft = FeedComposerDraft().withVisibility(FeedPostVisibility.FRIENDS)

        assertThat(draft.visibility).isEqualTo(FeedPostVisibility.FRIENDS)
        assertThat(draft.visibility.wire).isEqualTo("FRIENDS")
    }

    @Test
    fun `every visibility case carries the exact wire string the gateway expects`() {
        assertThat(FeedPostVisibility.PUBLIC.wire).isEqualTo("PUBLIC")
        assertThat(FeedPostVisibility.FRIENDS.wire).isEqualTo("FRIENDS")
        assertThat(FeedPostVisibility.PRIVATE.wire).isEqualTo("PRIVATE")
    }

    // --- publish request --------------------------------------------------

    @Test
    fun `a blank draft yields no publish request`() {
        assertThat(FeedComposerDraft().publishRequest()).isNull()
        assertThat(FeedComposerDraft().withText("   ").publishRequest()).isNull()
    }

    @Test
    fun `a non-blank draft yields a publish request carrying the trimmed body and wire visibility`() {
        val request = FeedComposerDraft()
            .withText("  hello world  ")
            .withVisibility(FeedPostVisibility.PRIVATE)
            .publishRequest()

        assertThat(request).isNotNull()
        assertThat(request!!.content).isEqualTo("hello world")
        assertThat(request.visibility).isEqualTo("PRIVATE")
    }

    @Test
    fun `a publish request always defaults to public when the visibility was never changed`() {
        val request = FeedComposerDraft().withText("hi").publishRequest()

        assertThat(request).isNotNull()
        assertThat(request!!.visibility).isEqualTo("PUBLIC")
    }

    // --- media attachments -------------------------------------------------

    @Test
    fun `a fresh draft has no media and the full allowance remaining`() {
        val draft = FeedComposerDraft()

        assertThat(draft.mediaIds).isEmpty()
        assertThat(draft.remainingMediaSlots).isEqualTo(FeedComposerDraft.MAX_MEDIA)
        assertThat(draft.isMediaFull).isFalse()
    }

    @Test
    fun `withMedia appends uploaded ids and enables publishing even with blank text`() {
        val draft = FeedComposerDraft().withMedia(listOf("m1", "m2"))

        assertThat(draft.mediaIds).containsExactly("m1", "m2").inOrder()
        assertThat(draft.canPublish).isTrue()
    }

    @Test
    fun `withMedia accumulates across multiple picks`() {
        val draft = FeedComposerDraft().withMedia(listOf("m1")).withMedia(listOf("m2", "m3"))

        assertThat(draft.mediaIds).containsExactly("m1", "m2", "m3").inOrder()
    }

    @Test
    fun `withMedia caps the total at the MAX_MEDIA allowance`() {
        val eight = List(8) { "existing$it" }
        val draft = FeedComposerDraft(mediaIds = eight).withMedia(listOf("n1", "n2", "n3", "n4", "n5"))

        assertThat(draft.mediaIds).hasSize(FeedComposerDraft.MAX_MEDIA)
        assertThat(draft.mediaIds).containsExactlyElementsIn(eight + listOf("n1", "n2")).inOrder()
    }

    @Test
    fun `withoutMedia removes exactly the matching id`() {
        val draft = FeedComposerDraft(mediaIds = listOf("m1", "m2", "m3")).withoutMedia("m2")

        assertThat(draft.mediaIds).containsExactly("m1", "m3").inOrder()
    }

    @Test
    fun `withoutMedia on an unknown id is inert`() {
        val draft = FeedComposerDraft(mediaIds = listOf("m1"))

        assertThat(draft.withoutMedia("does-not-exist").mediaIds).containsExactly("m1")
    }

    @Test
    fun `removing the last media disables publishing again when text is also blank`() {
        val draft = FeedComposerDraft().withMedia(listOf("m1")).withoutMedia("m1")

        assertThat(draft.canPublish).isFalse()
    }

    @Test
    fun `remainingMediaSlots counts down and isMediaFull flips at the cap`() {
        val almostFull = FeedComposerDraft(mediaIds = List(FeedComposerDraft.MAX_MEDIA - 1) { "m$it" })
        assertThat(almostFull.remainingMediaSlots).isEqualTo(1)
        assertThat(almostFull.isMediaFull).isFalse()

        val full = FeedComposerDraft(mediaIds = List(FeedComposerDraft.MAX_MEDIA) { "m$it" })
        assertThat(full.remainingMediaSlots).isEqualTo(0)
        assertThat(full.isMediaFull).isTrue()
    }

    @Test
    fun `blank text with attached media still yields a publish request carrying the media ids`() {
        val request = FeedComposerDraft().withMedia(listOf("m1", "m2")).publishRequest()

        assertThat(request).isNotNull()
        assertThat(request!!.content).isEmpty()
        assertThat(request.mediaIds).containsExactly("m1", "m2").inOrder()
    }

    @Test
    fun `a text-only publish request carries no media ids`() {
        val request = FeedComposerDraft().withText("hello").publishRequest()

        assertThat(request).isNotNull()
        assertThat(request!!.mediaIds).isEmpty()
    }

    @Test
    fun `a publish request with both text and media carries both`() {
        val request = FeedComposerDraft().withText("hello").withMedia(listOf("m1")).publishRequest()

        assertThat(request).isNotNull()
        assertThat(request!!.content).isEqualTo("hello")
        assertThat(request.mediaIds).containsExactly("m1")
    }
}
