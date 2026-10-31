package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * La flamme-œil côté LECTEUR (iOS `AfterReadVisit`, #8303) : seules les flammes-œil
 * REÇUES et AFFICHÉES pendant la visite partent à la sortie ; la seconde sortie ne
 * trouve plus rien.
 */
class AfterReadVisitTest {

    private val afterRead = (MessageEffectFlags.EPHEMERAL or MessageEffectFlags.EPHEMERAL_AFTER_READ).toInt()

    private fun message(id: String, sender: String = "other", flags: Int? = afterRead, deletedAt: String? = null) =
        ApiMessage(id = id, conversationId = "c", senderId = sender, effectFlags = flags, deletedAt = deletedAt)

    private val isMine: (ApiMessage) -> Boolean = { it.senderId == "me" }

    @Test
    fun keepsOnlyReceivedAfterReadMessagesThatWereDisplayed() {
        val messages = listOf(
            message("a"),
            message("b", sender = "me"),
            message("c", flags = MessageEffectFlags.EPHEMERAL.toInt()),
            message("d", deletedAt = "2026-10-31T10:00:00Z"),
            message("e"),
            message("f"),
        )
        val visit = AfterReadVisit()
            .noting(displayed = listOf("a", "b", "c", "d", "f"), among = messages, isMine = isMine)

        val (ids, emptied) = visit.takeAll()

        assertThat(ids).containsExactly("a", "f").inOrder()
        assertThat(emptied.takeAll().first).isEmpty()
    }

    @Test
    fun displayedTwice_isConsumedOnce() {
        val messages = listOf(message("a"))
        val visit = AfterReadVisit()
            .noting(listOf("a"), messages, isMine)
            .noting(listOf("a"), messages, isMine)
        assertThat(visit.takeAll().first).containsExactly("a")
    }

    @Test
    fun nothingDisplayed_nothingConsumed() {
        assertThat(AfterReadVisit().noting(emptyList(), listOf(message("a")), isMine).takeAll().first).isEmpty()
    }

    @Test
    fun isConsumable_needsTheAfterReadBit_notJustEphemeral() {
        assertThat(AfterReadVisit.isConsumable(message("a"), isMine)).isTrue()
        assertThat(AfterReadVisit.isConsumable(message("a", flags = MessageEffectFlags.EPHEMERAL.toInt()), isMine)).isFalse()
        assertThat(AfterReadVisit.isConsumable(message("a", sender = "me"), isMine)).isFalse()
    }
}
