package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.BubbleFlagTap.Action
import me.meeshy.sdk.model.BubbleFlagTap.Context
import org.junit.Test

class BubbleFlagTapTest {

    private fun tap(
        code: String,
        current: Context = Context(activeCode = "fr"),
        original: String? = "en",
        preferred: String? = "fr",
        content: Set<String> = setOf("fr", "es"),
    ) = BubbleFlagTap.handleTap(code, current, original, preferred, content)

    @Test
    fun `tapping the original switches the primary text to it and closes the panel`() {
        val outcome = tap("en", Context("fr", "es"))
        assertThat(outcome.action).isEqualTo(Action.SwitchPrimary)
        assertThat(outcome.activeCode).isEqualTo("en")
        assertThat(outcome.secondaryCode).isNull()
    }

    @Test
    fun `tapping the primary Prisme language brings the text back to it`() {
        val outcome = tap("fr", Context("en", "es"))
        assertThat(outcome.action).isEqualTo(Action.SwitchPrimary)
        assertThat(outcome.activeCode).isEqualTo("fr")
        assertThat(outcome.secondaryCode).isNull()
    }

    @Test
    fun `tapping a third language with content opens the secondary panel`() {
        val outcome = tap("es")
        assertThat(outcome.action).isEqualTo(Action.OpenSecondary)
        assertThat(outcome.secondaryCode).isEqualTo("es")
        assertThat(outcome.activeCode).isEqualTo("fr")
    }

    @Test
    fun `tapping the open secondary language closes it`() {
        val outcome = tap("es", Context("fr", "es"))
        assertThat(outcome.action).isEqualTo(Action.CloseSecondary)
        assertThat(outcome.secondaryCode).isNull()
        assertThat(outcome.activeCode).isEqualTo("fr")
    }

    @Test
    fun `tapping another language moves the panel to it`() {
        val outcome = tap("de", Context("fr", "es"), content = setOf("fr", "es", "de"))
        assertThat(outcome.action).isEqualTo(Action.OpenSecondary)
        assertThat(outcome.secondaryCode).isEqualTo("de")
    }

    @Test
    fun `tapping a language without content requests its translation and changes nothing`() {
        val outcome = tap("de", Context("fr", "es"))
        assertThat(outcome.action).isEqualTo(Action.RequestTranslation)
        assertThat(outcome.targetLanguage).isEqualTo("de")
        assertThat(outcome.activeCode).isEqualTo("fr")
        assertThat(outcome.secondaryCode).isEqualTo("es")
    }

    @Test
    fun `codes are compared case-insensitively`() {
        assertThat(tap(" EN ").action).isEqualTo(Action.SwitchPrimary)
        assertThat(tap("ES").action).isEqualTo(Action.OpenSecondary)
    }

    @Test
    fun `a blank code is inert`() {
        val outcome = tap("  ")
        assertThat(outcome.action).isEqualTo(Action.None)
        assertThat(outcome.activeCode).isEqualTo("fr")
    }
}
