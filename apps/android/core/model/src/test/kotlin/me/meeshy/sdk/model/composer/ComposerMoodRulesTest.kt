package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerMoodRules.Cell
import me.meeshy.sdk.model.composer.ComposerMoodRules.PublishDecision
import org.junit.Test

class ComposerMoodRulesTest {
    @Test
    fun `le mot est tronque a 122 caracteres`() {
        assertThat(ComposerMoodRules.clampWord("a".repeat(130))).hasLength(122)
        assertThat(ComposerMoodRules.clampWord("ok")).isEqualTo("ok")
    }

    @Test
    fun `le compteur est invisible puis passe en alerte a 101`() {
        assertThat(ComposerMoodRules.counter("").visible).isFalse()
        assertThat(ComposerMoodRules.counter("a".repeat(100)).alert).isFalse()
        assertThat(ComposerMoodRules.counter("a".repeat(101)).alert).isTrue()
        assertThat(ComposerMoodRules.counter("abc")).isEqualTo(ComposerMoodRules.Counter(3, 122, true, false))
    }

    @Test
    fun `publier sans emoji ne part pas`() {
        assertThat(ComposerMoodRules.decide(null, "mot", false)).isEqualTo(PublishDecision.NeedsEmoji)
        assertThat(ComposerMoodRules.decide("", "mot", false)).isEqualTo(PublishDecision.NeedsEmoji)
    }

    @Test
    fun `une humeur sans mot demande confirmation sauf republication`() {
        assertThat(ComposerMoodRules.decide("🔥", "  ", false)).isEqualTo(PublishDecision.AskForWord)
        assertThat(ComposerMoodRules.decide("🔥", "", true)).isEqualTo(PublishDecision.Publish)
        assertThat(ComposerMoodRules.decide("🔥", "yo", false)).isEqualTo(PublishDecision.Publish)
    }

    @Test
    fun `la grille finit par la case plus d emojis et reinjecte l emoji hors grille`() {
        val offered = listOf("😴", "🔥")
        assertThat(ComposerMoodRules.cells(offered, "🔥")).containsExactly(Cell.Emoji("😴", false), Cell.Emoji("🔥", true), Cell.More).inOrder()
        assertThat(ComposerMoodRules.cells(offered, "🥳"))
            .containsExactly(Cell.Emoji("😴", false), Cell.Emoji("🔥", false), Cell.Emoji("🥳", true), Cell.More).inOrder()
    }

    @Test
    fun `retaper l emoji le deselectionne`() {
        assertThat(ComposerMoodRules.toggled("🔥", "🔥")).isNull()
        assertThat(ComposerMoodRules.toggled("🔥", "😴")).isEqualTo("😴")
    }

    @Test
    fun `un emoji trop long est refuse`() {
        assertThat(ComposerMoodRules.acceptsPicked("x".repeat(11))).isFalse()
        assertThat(ComposerMoodRules.acceptsPicked("🔥")).isTrue()
    }
}
