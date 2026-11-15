package me.meeshy.sdk.sync

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ConversationReadEvent
import org.junit.Test

class UnreadLedgerTest {

    private fun ledger() = UnreadLedger()

    @Test
    fun `un snapshot gonfle est ramene a zero pour la conversation ouverte, des l'entree et a chaque evenement`() {
        val ledger = ledger()
        ledger.apply(ConversationReadEvent.ServerUnread("a", 75))
        ledger.open("a")
        assertThat(ledger.snapshot.value.counts["a"]).isEqualTo(0)
        ledger.apply(ConversationReadEvent.ServerUnread("a", 80))
        assertThat(ledger.snapshot.value.counts["a"]).isEqualTo(0)
        assertThat(ledger.snapshot.value.totalOthers).isEqualTo(0)
    }

    @Test
    fun `la fermeture sans lecture partielle rend le vrai decompte servi`() {
        val ledger = ledger()
        ledger.apply(ConversationReadEvent.ServerUnread("a", 4))
        ledger.open("a")
        ledger.apply(ConversationReadEvent.ServerUnread("a", 6))
        assertThat(ledger.close("a")).isNull()
        assertThat(ledger.snapshot.value.counts["a"]).isEqualTo(6)
    }

    @Test
    fun `apres une lecture partielle la fermeture restitue le reste reel`() {
        val ledger = ledger()
        ledger.apply(ConversationReadEvent.ServerUnread("a", 75))
        ledger.open("a")
        ledger.noteUnreadRemaining("a", 12)
        assertThat(ledger.close("a")).isEqualTo(12)
        assertThat(ledger.snapshot.value.counts["a"]).isEqualTo(12)
    }

    @Test
    fun `deux fenetres - la conversation ne se rend qu'a la derniere fermeture`() {
        val ledger = ledger()
        ledger.apply(ConversationReadEvent.ServerUnread("a", 5))
        ledger.open("a")
        ledger.open("a")
        ledger.close("a")
        assertThat(ledger.snapshot.value.counts["a"]).isEqualTo(0)
        ledger.close("a")
        assertThat(ledger.snapshot.value.counts["a"]).isEqualTo(5)
    }

    @Test
    fun `le total des autres exclut l'ouverte`() {
        val ledger = ledger()
        ledger.apply(ConversationReadEvent.ServerUnread("a", 3))
        ledger.apply(ConversationReadEvent.ServerUnread("b", 9))
        ledger.open("b")
        assertThat(ledger.snapshot.value.totalOthers).isEqualTo(3)
    }

    @Test
    fun `un accuse rejoue ne recule jamais`() {
        val ledger = ledger()
        ledger.apply(ConversationReadEvent.ServerReceipt("a", 1, lastReadAt = 100))
        ledger.apply(ConversationReadEvent.ServerReceipt("a", 8, lastReadAt = 100))
        assertThat(ledger.snapshot.value.counts["a"]).isEqualTo(1)
    }

    @Test
    fun `clear vide tout`() = runTest {
        val ledger = ledger()
        ledger.apply(ConversationReadEvent.ServerUnread("a", 3))
        ledger.clear()
        assertThat(ledger.snapshot.value.counts).isEmpty()
    }
}
