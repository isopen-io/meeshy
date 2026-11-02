package me.meeshy.sdk.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ExplicitUnreadMarksTest {

    @Test
    fun `une marque notee se consomme une seule fois`() {
        val marks = ExplicitUnreadMarks()

        marks.note("c1")

        assertThat(marks.consume("c1")).isTrue()
        assertThat(marks.consume("c1")).isFalse()
    }

    @Test
    fun `consommer une conversation non marquee rend faux`() {
        assertThat(ExplicitUnreadMarks().consume("c1")).isFalse()
    }

    @Test
    fun `la reouverture efface la marque`() {
        val marks = ExplicitUnreadMarks()
        marks.note("c1")
        marks.note("c2")

        marks.clear("c1")

        assertThat(marks.snapshot()).containsExactly("c2")
        assertThat(marks.consume("c1")).isFalse()
    }

    @Test
    fun `un identifiant vide n est jamais marque`() {
        val marks = ExplicitUnreadMarks()

        marks.note(" ")

        assertThat(marks.snapshot()).isEmpty()
    }

    @Test
    fun `le changement de compte oublie toutes les marques`() {
        val marks = ExplicitUnreadMarks()
        marks.note("c1")

        marks.forgetAll()

        assertThat(marks.snapshot()).isEmpty()
    }
}
