package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class UnreadRulesTest {

    @Test
    fun `la conversation ouverte s'affiche a zero et un negatif est ramene a zero`() {
        assertThat(UnreadRules.displayed(75, isOpen = true)).isEqualTo(0)
        assertThat(UnreadRules.displayed(4, isOpen = false)).isEqualTo(4)
        assertThat(UnreadRules.displayed(-2, isOpen = false)).isEqualTo(0)
    }

    @Test
    fun `le total des autres conversations exclut les ouvertes et clamp a zero`() {
        val counts = mapOf("a" to 3, "b" to 75, "c" to -5)
        assertThat(UnreadRules.totalConversationsUnread(counts, setOf("b"))).isEqualTo(3)
        assertThat(UnreadRules.totalConversationsUnread(counts, emptySet())).isEqualTo(78)
    }

    @Test
    fun `le reste apres une lecture partielle est rendu a la fermeture`() {
        val open = OpenConversations().open("a", currentUnread = 75).noteUnreadRemaining("a", 12)
        val closing = open.close("a")
        assertThat(closing.closed).isTrue()
        assertThat(closing.restore).isEqualTo(12)
    }

    @Test
    fun `deux fenetres - le decompte ne se rend qu'a la derniere fermeture`() {
        val two = OpenConversations().open("a", 5).open("a", 0)
        val first = two.close("a")
        assertThat(first.closed).isFalse()
        assertThat(first.restore).isNull()
        assertThat(first.next.isOpen("a")).isTrue()
        val last = first.next.close("a")
        assertThat(last.closed).isTrue()
        assertThat(last.restore).isEqualTo(5)
        assertThat(last.next.ids).isEmpty()
    }

    @Test
    fun `fermer une conversation non ouverte ne fait rien`() {
        val closing = OpenConversations().close("x")
        assertThat(closing.closed).isFalse()
        assertThat(closing.restore).isNull()
    }

    @Test
    fun `noteUnreadRemaining ignore une conversation fermee`() {
        val after = OpenConversations().noteUnreadRemaining("a", 3).open("a", 9)
        assertThat(after.close("a").restore).isEqualTo(9)
    }

    @Test
    fun `current est la plus recemment ouverte`() {
        val s = OpenConversations().open("a", 0).open("b", 0).open("a", 0)
        assertThat(s.current).isEqualTo("a")
    }
}
