package me.meeshy.app.widget.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class WidgetInitialsTest {

    @Test
    fun `two first words give two uppercase initials`() {
        assertThat(WidgetInitials.of("marie curie")).isEqualTo("MC")
    }

    @Test
    fun `words beyond the second are ignored`() {
        assertThat(WidgetInitials.of("Jean Paul Sartre")).isEqualTo("JP")
    }

    @Test
    fun `a single word gives one initial`() {
        assertThat(WidgetInitials.of("mom")).isEqualTo("M")
    }

    @Test
    fun `extra whitespace is ignored`() {
        assertThat(WidgetInitials.of("  ada   lovelace ")).isEqualTo("AL")
    }

    @Test
    fun `a blank name falls back to a question mark`() {
        assertThat(WidgetInitials.of("   ")).isEqualTo("?")
        assertThat(WidgetInitials.of("")).isEqualTo("?")
    }
}
