package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerFormat.POST
import me.meeshy.sdk.model.composer.ComposerFormat.REEL
import me.meeshy.sdk.model.composer.ComposerFormat.STATUS
import me.meeshy.sdk.model.composer.ComposerFormat.STORY
import org.junit.Test

class ComposerFormatAvailabilityTest {
    @Test
    fun `verdicts keep the order of the candidates, never the order of the offer`() {
        val verdicts = ComposerFormatAvailability.verdicts(
            candidates = listOf(POST, STORY, REEL),
            offered = listOf(REEL, POST),
            carriesMoreThanText = true,
        )
        assertThat(verdicts.map { it.format }).containsExactly(POST, STORY, REEL).inOrder()
        assertThat(verdicts.map { it.isChoosable }).containsExactly(true, false, true).inOrder()
    }

    @Test
    fun `a choosable format has no reason and a refused one always has its own`() {
        val verdicts = ComposerFormatAvailability.verdicts(listOf(POST, STORY), listOf(POST), true)
        assertThat(verdicts[0].denial).isNull()
        assertThat(verdicts[1].denial).isEqualTo(FormatDenial.STORY_FROM_THIS_DOOR)
    }

    @Test
    fun `mood refuses for two opposite causes, each with its own sentence`() {
        assertThat(ComposerFormatAvailability.denial(STATUS, carriesMoreThanText = true)).isEqualTo(FormatDenial.MOOD_TEXT_ONLY)
        assertThat(ComposerFormatAvailability.denial(STATUS, carriesMoreThanText = false)).isEqualTo(FormatDenial.MOOD_EMPTY)
    }

    @Test
    fun `reel and post have a single denial regardless of the composition`() {
        assertThat(ComposerFormatAvailability.denial(REEL, true)).isEqualTo(FormatDenial.REEL_NEEDS_MATERIAL)
        assertThat(ComposerFormatAvailability.denial(REEL, false)).isEqualTo(FormatDenial.REEL_NEEDS_MATERIAL)
        assertThat(ComposerFormatAvailability.denial(POST, false)).isEqualTo(FormatDenial.POST_UNAVAILABLE)
    }

    @Test
    fun `the selection never leaves the offer`() {
        assertThat(ComposerFormatFanPolicy.resolvedSelection(REEL, listOf(POST, STORY))).isEqualTo(POST)
        assertThat(ComposerFormatFanPolicy.resolvedSelection(STORY, listOf(POST, STORY))).isEqualTo(STORY)
        assertThat(ComposerFormatFanPolicy.resolvedSelection(REEL, emptyList())).isEqualTo(REEL)
    }

    @Test
    fun `mood needs text or an emoji and no media nor scene`() {
        assertThat(ComposerMoodGate.qualifies("hello", hasMedia = false, hasScene = false, moodEmoji = null)).isTrue()
        assertThat(ComposerMoodGate.qualifies("   ", hasMedia = false, hasScene = false, moodEmoji = null)).isFalse()
        assertThat(ComposerMoodGate.qualifies("", hasMedia = false, hasScene = false, moodEmoji = "😀")).isTrue()
        assertThat(ComposerMoodGate.qualifies("hello", hasMedia = true, hasScene = false, moodEmoji = "😀")).isFalse()
        assertThat(ComposerMoodGate.qualifies("hello", hasMedia = false, hasScene = true, moodEmoji = null)).isFalse()
        assertThat(ComposerMoodGate.withoutComposition).isFalse()
    }
}
