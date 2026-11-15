package me.meeshy.sdk.model.piece

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import org.junit.Test

class PieceDeletionTest {

    private fun photo(id: String) = ApiMessageAttachment(id = id, mimeType = "image/jpeg")

    private fun place(id: String) = ApiMessageAttachment(id = id, latitude = 1.0, longitude = 2.0)

    private fun message(vararg pieces: ApiMessageAttachment, text: String = "", senderId: String = "me", id: String = "64b7f0a1c2d3e4f5a6b7c8d9") =
        ApiMessage(id = id, conversationId = "c1", senderId = senderId, content = text, attachments = pieces.toList())

    @Test
    fun `une piece visee est la seule designee, jamais sa voisine`() {
        val m = message(photo("a"), photo("b"), photo("c"))

        assertThat(PieceDeletion.deletableMedia(m, "b")).isEqualTo("b")
        assertThat(PieceDeletion.deletableMedia(m, "ghost")).isNull()
    }

    @Test
    fun `un lot sans visee ne designe rien et une piece unique se designe seule`() {
        assertThat(PieceDeletion.deletableMedia(message(photo("a"), photo("b")), null)).isNull()
        assertThat(PieceDeletion.deletableMedia(message(photo("a")), null)).isEqualTo("a")
        assertThat(PieceDeletion.deletableMedia(message(photo("a"), place("p")), null)).isEqualTo("a")
    }

    @Test
    fun `un lieu n'est jamais un media supprimable`() {
        assertThat(PieceDeletion.deletableMedia(message(photo("a"), place("p")), "p")).isNull()
    }

    @Test
    fun `une piece parmi d'autres ne retire qu'elle et rend ce qui reste`() {
        val plan = PieceDeletion.plan(message(photo("a"), photo("b")), "a")

        assertThat(plan).isEqualTo(PieceDeletion.Plan.RemovePiece("a", listOf(photo("b"))))
    }

    @Test
    fun `la piece d'un message qui garde du texte ne retire que la piece`() {
        val plan = PieceDeletion.plan(message(photo("a"), text = "regarde"), "a")

        assertThat(plan).isEqualTo(PieceDeletion.Plan.RemovePiece("a", emptyList()))
    }

    @Test
    fun `la derniere piece d'un message sans texte supprime le message entier`() {
        assertThat(PieceDeletion.plan(message(photo("a"), text = "  "), "a")).isEqualTo(PieceDeletion.Plan.DeleteMessage)
    }

    @Test
    fun `une piece etrangere ne fait rien`() {
        assertThat(PieceDeletion.plan(message(photo("a")), "ghost")).isEqualTo(PieceDeletion.Plan.Nothing)
    }

    @Test
    fun `seul l'auteur d'un message accuse, vivant et en clair peut effacer sa piece`() {
        val own = message(photo("a"))

        assertThat(PieceDeletion.mayDelete(own, "me", conversationIsEndToEnd = false)).isTrue()
        assertThat(PieceDeletion.mayDelete(own, "other", conversationIsEndToEnd = false)).isFalse()
        assertThat(PieceDeletion.mayDelete(own, null, conversationIsEndToEnd = false)).isFalse()
        assertThat(PieceDeletion.mayDelete(own, "me", conversationIsEndToEnd = true)).isFalse()
        assertThat(PieceDeletion.mayDelete(own.copy(deletedAt = "2026-10-28T10:00:00Z"), "me", conversationIsEndToEnd = false)).isFalse()
    }

    @Test
    fun `une bulle locale non accusee ne se supprime pas encore`() {
        val local = message(photo("a"), id = "cid_8f0c")

        assertThat(PieceDeletion.mayDelete(local, "me", conversationIsEndToEnd = false)).isFalse()
    }
}
