package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ConversationReadEvent
import me.meeshy.sdk.sync.UnreadLedger
import org.junit.Test

class TotalUnreadTest {

    @Test
    fun `une seule formule pour le registre vivant et la fonction pure`() = runTest {
        val ledger = UnreadLedger()
        ledger.apply(ConversationReadEvent.ServerUnread("a", 3))
        ledger.apply(ConversationReadEvent.ServerUnread("b", 75))
        ledger.open("b")

        val live = TotalUnread.live(ledger).first()

        assertThat(live).isEqualTo(3)
        assertThat(TotalUnread.of(mapOf("a" to 3, "b" to 75), setOf("b"))).isEqualTo(live)
    }

    @Test
    fun `la fermeture de l'ouverte rend son decompte au total`() = runTest {
        val ledger = UnreadLedger()
        ledger.apply(ConversationReadEvent.ServerUnread("b", 75))
        ledger.open("b")
        ledger.close("b")

        assertThat(TotalUnread.live(ledger).first()).isEqualTo(75)
    }
}
