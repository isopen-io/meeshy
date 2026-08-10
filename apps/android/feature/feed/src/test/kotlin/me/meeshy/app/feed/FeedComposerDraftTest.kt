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
}
