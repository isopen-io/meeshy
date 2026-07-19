package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure status-composer draft — the Android SSOT for the
 * mood-status composer (port of iOS `StatusComposerView`'s local `@State`). It owns
 * the single publish rule ("an emoji must be picked"), the 122-char text cap, the
 * whitespace-stripped body actually sent, and the emoji toggle/visibility
 * transitions, so the Composable stays glue and the rules are fully unit-tested.
 */
class StatusComposerDraftTest {

    // --- publish gate ---------------------------------------------------------

    @Test
    fun `a fresh draft has no emoji and cannot be published`() {
        val draft = StatusComposerDraft()

        assertThat(draft.selectedEmoji).isNull()
        assertThat(draft.canPublish).isFalse()
    }

    @Test
    fun `selecting an emoji enables publishing`() {
        val draft = StatusComposerDraft().toggleEmoji("🔥")

        assertThat(draft.selectedEmoji).isEqualTo("🔥")
        assertThat(draft.canPublish).isTrue()
    }

    @Test
    fun `toggling the selected emoji clears it and disables publishing`() {
        val draft = StatusComposerDraft().toggleEmoji("🔥").toggleEmoji("🔥")

        assertThat(draft.selectedEmoji).isNull()
        assertThat(draft.canPublish).isFalse()
    }

    @Test
    fun `toggling a different emoji replaces the current selection`() {
        val draft = StatusComposerDraft().toggleEmoji("🔥").toggleEmoji("🎉")

        assertThat(draft.selectedEmoji).isEqualTo("🎉")
    }

    // --- text cap -------------------------------------------------------------

    @Test
    fun `text within the limit is kept verbatim with the remaining budget reported`() {
        val draft = StatusComposerDraft().withText("hello")

        assertThat(draft.text).isEqualTo("hello")
        assertThat(draft.charactersRemaining).isEqualTo(StatusComposerDraft.MAX_CHARS - 5)
    }

    @Test
    fun `text at the exact limit is accepted with zero budget remaining`() {
        val atLimit = "x".repeat(StatusComposerDraft.MAX_CHARS)

        val draft = StatusComposerDraft().withText(atLimit)

        assertThat(draft.text.length).isEqualTo(StatusComposerDraft.MAX_CHARS)
        assertThat(draft.charactersRemaining).isEqualTo(0)
    }

    @Test
    fun `text over the limit is clamped to the maximum`() {
        val tooLong = "x".repeat(StatusComposerDraft.MAX_CHARS + 8)

        val draft = StatusComposerDraft().withText(tooLong)

        assertThat(draft.text.length).isEqualTo(StatusComposerDraft.MAX_CHARS)
        assertThat(draft.charactersRemaining).isEqualTo(0)
    }

    // --- body actually sent ---------------------------------------------------

    @Test
    fun `trimmedContent strips surrounding whitespace`() {
        val draft = StatusComposerDraft().withText("  feeling good  ")

        assertThat(draft.trimmedContent).isEqualTo("feeling good")
    }

    @Test
    fun `trimmedContent is null for blank or empty text`() {
        assertThat(StatusComposerDraft().withText("   ").trimmedContent).isNull()
        assertThat(StatusComposerDraft().withText("").trimmedContent).isNull()
    }

    // --- counter affordance ---------------------------------------------------

    @Test
    fun `the near-limit warning is off at the threshold and on just past it`() {
        val atThreshold = StatusComposerDraft().withText("x".repeat(StatusComposerDraft.NEAR_LIMIT))
        val pastThreshold = StatusComposerDraft().withText("x".repeat(StatusComposerDraft.NEAR_LIMIT + 1))

        assertThat(atThreshold.isNearLimit).isFalse()
        assertThat(pastThreshold.isNearLimit).isTrue()
    }

    @Test
    fun `the counter is hidden until text is entered`() {
        assertThat(StatusComposerDraft().showCounter).isFalse()
        assertThat(StatusComposerDraft().withText("h").showCounter).isTrue()
    }

    // --- visibility -----------------------------------------------------------

    @Test
    fun `a fresh draft defaults to public visibility`() {
        assertThat(StatusComposerDraft().visibility).isEqualTo(StatusVisibility.PUBLIC)
    }

    @Test
    fun `changing visibility carries the wire value the gateway expects`() {
        val draft = StatusComposerDraft().withVisibility(StatusVisibility.FRIENDS)

        assertThat(draft.visibility).isEqualTo(StatusVisibility.FRIENDS)
        assertThat(draft.visibility.wire).isEqualTo("FRIENDS")
    }

    // --- mood options integrity ----------------------------------------------

    @Test
    fun `the mood options grid has no duplicate emoji`() {
        val options = StatusComposerDraft.MOOD_OPTIONS

        assertThat(options).isNotEmpty()
        assertThat(options.toSet()).hasSize(options.size)
    }
}
