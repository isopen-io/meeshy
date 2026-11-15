package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MentionLedgerTest {
    private fun mention(messageId: String = "m1", conversationId: String = "c1", mentioned: String? = "me", sender: String? = "u2") =
        MentionCreatedEvent(messageId, conversationId, senderId = sender, mentionedUserId = mentioned)

    @Test
    fun `une mention rejouee ne compte qu'une fois`() {
        val first = MentionLedger().onMentionCreated(mention(), "me", conversationIsOpen = false)
        val again = first.ledger.onMentionCreated(mention(), "me", conversationIsOpen = false)
        assertThat(first.ledger.total).isEqualTo(1)
        assertThat(first.alertDue).isTrue()
        assertThat(again.ledger.total).isEqualTo(1)
        assertThat(again.alertDue).isFalse()
    }

    @Test
    fun `une mention deja annoncee par notification new compte au badge sans seconde alerte`() {
        val ledger = MentionLedger().onNotification("m1")
        val outcome = ledger.onMentionCreated(mention(), "me", conversationIsOpen = false)
        assertThat(outcome.ledger.count("c1")).isEqualTo(1)
        assertThat(outcome.alertDue).isFalse()
    }

    @Test
    fun `une conversation ouverte ne compte rien`() {
        val outcome = MentionLedger().onMentionCreated(mention(), "me", conversationIsOpen = true)
        assertThat(outcome.ledger.total).isEqualTo(0)
        assertThat(outcome.alertDue).isFalse()
    }

    @Test
    fun `la mention d'un autre ou la mienne ne compte pas`() {
        assertThat(MentionLedger().onMentionCreated(mention(mentioned = "other"), "me", false).ledger.total).isEqualTo(0)
        assertThat(MentionLedger().onMentionCreated(mention(sender = "me"), "me", false).ledger.total).isEqualTo(0)
    }

    @Test
    fun `lire la conversation efface ses mentions seulement`() {
        val ledger = MentionLedger()
            .onMentionCreated(mention("m1", "c1"), "me", false).ledger
            .onMentionCreated(mention("m2", "c2"), "me", false).ledger
        val read = ledger.onRead("c1")
        assertThat(read.count("c1")).isEqualTo(0)
        assertThat(read.count("c2")).isEqualTo(1)
    }

    @Test
    fun `la memoire des annonces est bornee`() {
        val ledger = (1..MentionLedger.ANNOUNCED_CAP + 20).fold(MentionLedger()) { acc, i -> acc.onNotification("m$i") }
        assertThat(ledger.announced).hasSize(MentionLedger.ANNOUNCED_CAP)
        assertThat(ledger.announced.first()).isEqualTo("m21")
    }
}
