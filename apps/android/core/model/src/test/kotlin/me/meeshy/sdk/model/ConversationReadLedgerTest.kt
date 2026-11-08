package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationReadLedgerTest {

    private fun ledger(vararg events: ConversationReadEvent): ConversationReadLedgerState =
        events.fold(ConversationReadLedgerState()) { state, event -> state.apply(event).state }

    private fun unread(id: String, n: Int) = ConversationReadEvent.ServerUnread(id, n)

    @Test
    fun `rang 1 - la conversation ouverte se lit a zero sans perdre son compte servi`() {
        val open = ledger(unread("a", 3), ConversationReadEvent.LocalOpen("a"), unread("a", 5))
        assertThat(open.counts()["a"]).isEqualTo(0)
        assertThat(open.state("a")!!.unreadCount).isEqualTo(5)
        val closed = open.apply(ConversationReadEvent.LocalOpen(null)).state
        assertThat(closed.counts()["a"]).isEqualTo(5)
    }

    @Test
    fun `rang 2 - un accusé rejoué est jeté avec son compteur`() {
        val after = ledger(
            ConversationReadEvent.ServerReceipt("a", 2, lastReadAt = 100),
            ConversationReadEvent.ServerReceipt("a", 9, lastReadAt = 100),
            ConversationReadEvent.ServerReceipt("a", 9, lastReadAt = 50),
        )
        assertThat(after.state("a")!!.unreadCount).isEqualTo(2)
        val newer = after.apply(ConversationReadEvent.ServerReceipt("a", 1, lastReadAt = 101)).state
        assertThat(newer.state("a")!!.unreadCount).isEqualTo(1)
        assertThat(newer.state("a")!!.serverLastReadAt).isEqualTo(101)
    }

    @Test
    fun `rang 3 - le compteur servi gagne sur un geste local`() {
        val after = ledger(unread("a", 4), ConversationReadEvent.LocalMarkRead("a"), unread("a", 2))
        assertThat(after.state("a")!!.unreadCount).isEqualTo(2)
    }

    @Test
    fun `rang 4 - marquer lu tombe a zero tout de suite`() {
        val after = ledger(unread("a", 4), ConversationReadEvent.LocalMarkRead("a"))
        assertThat(after.total(excludingOpen = false, excludingMuted = false)).isEqualTo(0)
    }

    @Test
    fun `marquer non lu efface la frontiere serveur et pose au moins un`() {
        val after = ledger(
            ConversationReadEvent.ServerReceipt("a", 0, lastReadAt = 100),
            ConversationReadEvent.LocalMarkUnread("a"),
        )
        assertThat(after.state("a")!!.unreadCount).isEqualTo(1)
        assertThat(after.state("a")!!.serverLastReadAt).isNull()
        val rejoue = after.apply(ConversationReadEvent.ServerReceipt("a", 0, lastReadAt = 100)).state
        assertThat(rejoue.state("a")!!.unreadCount).isEqualTo(0)
    }

    @Test
    fun `marquer non lu garde un compteur deja superieur a un`() {
        val after = ledger(unread("a", 6), ConversationReadEvent.LocalMarkUnread("a"))
        assertThat(after.state("a")!!.unreadCount).isEqualTo(6)
    }

    @Test
    fun `snapshot cache seme les inconnues sans ecraser un compteur suivi`() {
        val after = ledger(
            unread("a", 3),
            ConversationReadEvent.Snapshot(
                listOf(ConversationReadRow("a", 0, isMuted = true), ConversationReadRow("b", 7)),
                ConversationReadSource.CACHE,
            ),
        )
        assertThat(after.state("a")!!.unreadCount).isEqualTo(3)
        assertThat(after.state("a")!!.isMuted).isTrue()
        assertThat(after.state("b")!!.unreadCount).isEqualTo(7)
    }

    @Test
    fun `snapshot serveur est autoritaire et oublie les absentes`() {
        val after = ledger(
            unread("a", 3),
            unread("gone", 2),
            ConversationReadEvent.Snapshot(listOf(ConversationReadRow("a", 0)), ConversationReadSource.SERVER),
        )
        assertThat(after.state("a")!!.unreadCount).isEqualTo(0)
        assertThat(after.state("gone")).isNull()
    }

    @Test
    fun `forget retire la ligne et rend l'entree d'avant`() {
        val before = ledger(unread("a", 3), ConversationReadEvent.LocalOpen("a"))
        val applied = before.apply(ConversationReadEvent.Forget("a"))
        assertThat(applied.previous!!.unreadCount).isEqualTo(3)
        assertThat(applied.state.state("a")).isNull()
        assertThat(applied.state.openConversationIds).isEmpty()
        assertThat(applied.state.apply(ConversationReadEvent.Forget("a")).previous).isNull()
    }

    @Test
    fun `total exclut l'ouverte et les muettes selon la borne declaree`() {
        val s = ledger(
            ConversationReadEvent.Snapshot(
                listOf(ConversationReadRow("a", 2), ConversationReadRow("b", 3, isMuted = true), ConversationReadRow("c", 4)),
                ConversationReadSource.SERVER,
            ),
            ConversationReadEvent.LocalOpenSet(setOf("c")),
        )
        assertThat(s.total(excludingOpen = true, excludingMuted = true)).isEqualTo(2)
        assertThat(s.total(excludingOpen = true, excludingMuted = false)).isEqualTo(5)
        assertThat(s.total(excludingOpen = false, excludingMuted = false)).isEqualTo(9)
        assertThat(s.conversationUnreadTotal(excludingOpen = true)).isEqualTo(1)
    }

    @Test
    fun `multi-fenetre - openConversationId est nul des deux fenetres`() {
        val s = ledger(ConversationReadEvent.LocalOpenSet(setOf("a", "b")))
        assertThat(s.openConversationId).isNull()
        assertThat(ledger(ConversationReadEvent.LocalOpen("a")).openConversationId).isEqualTo("a")
    }

    @Test
    fun `un compteur negatif servi est ramene a zero`() {
        assertThat(ledger(unread("a", -4)).state("a")!!.unreadCount).isEqualTo(0)
    }
}
