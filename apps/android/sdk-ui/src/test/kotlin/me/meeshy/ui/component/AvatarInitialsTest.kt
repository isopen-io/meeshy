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

    @Test
    fun `seules les lettres comptent, la ponctuation d'un nom de carnet est sautee`() {
        assertThat(avatarInitials("Théo (foot)")).isEqualTo("TF")
        assertThat(avatarInitials("(foot)")).isEqualTo("F")
        assertThat(avatarInitials("Jean-Pierre Dupont")).isEqualTo("JD")
    }

    @Test
    fun `un mot sans lettre, emoji compris, est saute`() {
        assertThat(avatarInitials("Alice \uD83C\uDF89 Martin")).isEqualTo("AM")
        assertThat(avatarInitials("\uD83C\uDF89 Alice")).isEqualTo("A")
    }

    @Test
    fun `sans aucune lettre le premier caractere reste le repli, un emoji entier`() {
        assertThat(avatarInitials("\uD83C\uDF89")).isEqualTo("\uD83C\uDF89")
        assertThat(avatarInitials("--- 42")).isEqualTo("-")
    }
}
