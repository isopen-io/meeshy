package me.meeshy.sdk.model.thread

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ThreadRepliesTest {

    private fun reply(
        id: String,
        at: Long,
        status: ThreadReplyStatus = ThreadReplyStatus.SENT,
        cid: String? = null,
        text: String = "t-$id",
    ) = ThreadReply(
        id = id,
        clientMessageId = cid,
        senderId = "u1",
        senderName = "Ana",
        senderAvatarUrl = null,
        text = text,
        createdAtMillis = at,
        isMine = false,
        status = status,
    )

    @Test
    fun `le cache n'amorce le fil que s'il est vide`() {
        assertThat(ThreadReplies.shouldApplyCacheSeed(emptyList(), listOf(reply("a", 1)))).isTrue()
        assertThat(ThreadReplies.shouldApplyCacheSeed(listOf(reply("b", 2)), listOf(reply("a", 1)))).isFalse()
        assertThat(ThreadReplies.shouldApplyCacheSeed(emptyList(), emptyList())).isFalse()
    }

    @Test
    fun `une page serveur remplace les reponses confirmees et garde l'optimiste non couvert`() {
        val current = listOf(reply("old", 1), reply("cid_x", 50, ThreadReplyStatus.SENDING, cid = "cid_x"))
        val merged = ThreadReplies.mergeFirstPage(current, listOf(reply("s1", 10), reply("s2", 20)))
        assertThat(merged.map { it.id }).containsExactly("s1", "s2", "cid_x").inOrder()
    }

    @Test
    fun `une page serveur ne duplique pas l'optimiste qu'elle confirme par son clientMessageId`() {
        val current = listOf(reply("cid_x", 50, ThreadReplyStatus.SENDING, cid = "cid_x"))
        val merged = ThreadReplies.mergeFirstPage(current, listOf(reply("srv", 51, cid = "cid_x")))
        assertThat(merged.map { it.id }).containsExactly("srv")
    }

    @Test
    fun `une reponse en echec reste visible apres un rafraichissement`() {
        val current = listOf(reply("cid_f", 60, ThreadReplyStatus.FAILED, cid = "cid_f"))
        val merged = ThreadReplies.mergeFirstPage(current, listOf(reply("s1", 10)))
        assertThat(merged.map { it.id }).containsExactly("s1", "cid_f").inOrder()
    }

    @Test
    fun `une page suivante s'ajoute sans doublon et reste triee`() {
        val current = listOf(reply("a", 1), reply("b", 2))
        val merged = ThreadReplies.appendPage(current, listOf(reply("b", 2), reply("c", 3)))
        assertThat(merged.map { it.id }).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `l'optimiste s'ajoute en fin et se retire ou passe en echec`() {
        val base = listOf(reply("a", 1))
        val added = ThreadReplies.withOptimistic(base, reply("cid_1", 9, ThreadReplyStatus.SENDING, cid = "cid_1"))
        assertThat(added.map { it.id }).containsExactly("a", "cid_1").inOrder()
        assertThat(ThreadReplies.without(added, "cid_1").map { it.id }).containsExactly("a")
        assertThat(ThreadReplies.markFailed(added, "cid_1").last().status).isEqualTo(ThreadReplyStatus.FAILED)
    }

    @Test
    fun `l'envoi exige un texte non blanc et aucun envoi en cours`() {
        assertThat(ThreadReplies.canSend("  hi ", sending = false)).isTrue()
        assertThat(ThreadReplies.canSend("   ", sending = false)).isFalse()
        assertThat(ThreadReplies.canSend("hi", sending = true)).isFalse()
    }
}
