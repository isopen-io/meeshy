package me.meeshy.ui.component

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AvatarInitialsTest {

    @Test
    fun `two words give two initials`() {
        assertThat(avatarInitials("Alice Martin")).isEqualTo("AM")
    }

    @Test
    fun `one word gives one initial`() {
        assertThat(avatarInitials("alice")).isEqualTo("A")
    }

    @Test
    fun `words beyond the first two are ignored`() {
        assertThat(avatarInitials("Alice Bob Carol")).isEqualTo("AB")
    }

    @Test
    fun `surrounding and repeated whitespace is collapsed`() {
        assertThat(avatarInitials("  alice   martin ")).isEqualTo("AM")
    }

    @Test
    fun `blank input yields a question mark`() {
        assertThat(avatarInitials("")).isEqualTo("?")
        assertThat(avatarInitials("   ")).isEqualTo("?")
    }
}
