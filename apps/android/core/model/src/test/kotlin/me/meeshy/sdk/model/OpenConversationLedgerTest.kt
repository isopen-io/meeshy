package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OpenConversationLedgerTest {
    private fun opened(vararg ids: String) =
        ids.fold(OpenConversationLedger()) { ledger, id -> ledger.opening(id).ledger }

    @Test
    fun `seule la premiere ouverture change la salle`() {
        val first = OpenConversationLedger().opening("a")
        val second = first.ledger.opening("a")
        assertThat(first.changed).isTrue()
        assertThat(second.changed).isFalse()
        assertThat(second.ledger.openCounts).containsExactly("a", 2)
    }

    @Test
    fun `une conversation ouverte deux fois puis fermee une fois reste ouverte`() {
        val ledger = opened("a", "a")
        val closed = ledger.closing("a")
        assertThat(closed.changed).isFalse()
        assertThat(closed.ledger.isOpen("a")).isTrue()
    }

    @Test
    fun `la derniere fermeture quitte la salle`() {
        val closed = opened("a").closing("a")
        assertThat(closed.changed).isTrue()
        assertThat(closed.ledger.isOpen("a")).isFalse()
        assertThat(closed.ledger.activeConversationId).isNull()
    }

    @Test
    fun `fermer une conversation jamais ouverte ne change rien`() {
        val closed = OpenConversationLedger().closing("zz")
        assertThat(closed.changed).isFalse()
        assertThat(closed.ledger).isEqualTo(OpenConversationLedger())
    }

    @Test
    fun `l'ordre d'ouverture place la plus recente en dernier et la reouverture la remonte`() {
        val ledger = opened("a", "b", "a")
        assertThat(ledger.openOrder).containsExactly("b", "a").inOrder()
        assertThat(ledger.activeConversationId).isEqualTo("a")
        assertThat(ledger.closing("a").ledger.activeConversationId).isEqualTo("a")
        assertThat(opened("a", "b").closing("b").ledger.activeConversationId).isEqualTo("a")
    }
}
