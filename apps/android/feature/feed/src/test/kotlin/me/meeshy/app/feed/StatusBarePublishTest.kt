package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Mirror of iOS `ComposerMoodBarePublishTests`: a mood without a word is confirmed, a republication is not. */
class StatusBarePublishTest {

    @Test
    fun `an empty word asks for a word`() {
        assertThat(StatusBarePublish.step(text = "", isRepublication = false)).isEqualTo(StatusBarePublish.Step.ASK_FOR_A_WORD)
    }

    @Test
    fun `a word of spaces counts as empty`() {
        assertThat(StatusBarePublish.step(text = "  \n ", isRepublication = false)).isEqualTo(StatusBarePublish.Step.ASK_FOR_A_WORD)
    }

    @Test
    fun `a real word publishes at once`() {
        assertThat(StatusBarePublish.step(text = "ok", isRepublication = false)).isEqualTo(StatusBarePublish.Step.PUBLISH)
    }

    @Test
    fun `a republication never asks, even without a word`() {
        assertThat(StatusBarePublish.step(text = "", isRepublication = true)).isEqualTo(StatusBarePublish.Step.PUBLISH)
    }

    @Test
    fun `the draft gives its own step`() {
        assertThat(StatusComposerDraft().toggleEmoji("🔥").publishStep).isEqualTo(StatusBarePublish.Step.ASK_FOR_A_WORD)
        assertThat(StatusComposerDraft().toggleEmoji("🔥").withText("yo").publishStep).isEqualTo(StatusBarePublish.Step.PUBLISH)
    }

    @Test
    fun `an emoji outside the offered grid is a custom one`() {
        assertThat(StatusBarePublish.customEmoji("🦄", StatusComposerDraft.MOOD_OPTIONS)).isEqualTo("🦄")
    }

    @Test
    fun `an offered, empty or absent emoji is not custom`() {
        assertThat(StatusBarePublish.customEmoji("🔥", StatusComposerDraft.MOOD_OPTIONS)).isNull()
        assertThat(StatusBarePublish.customEmoji("", StatusComposerDraft.MOOD_OPTIONS)).isNull()
        assertThat(StatusBarePublish.customEmoji(null, StatusComposerDraft.MOOD_OPTIONS)).isNull()
    }

    @Test
    fun `a picked emoji longer than the gateway cap is refused so the publish cannot 400`() {
        assertThat(StatusBarePublish.acceptsPicked("👨‍👩‍👧‍👦")).isFalse()
        assertThat(StatusBarePublish.acceptsPicked("🦄")).isTrue()
    }

    @Test
    fun `picking an emoji selects it`() {
        assertThat(StatusComposerDraft().withPickedEmoji("🦄").selectedEmoji).isEqualTo("🦄")
        assertThat(StatusComposerDraft().withPickedEmoji("👨‍👩‍👧‍👦").selectedEmoji).isNull()
    }
}
