package me.meeshy.sdk.model.piece

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import org.junit.Test

class MessagePieceTargetTest {

    private fun piece(id: String, mime: String, viewOnce: Boolean? = null, blurred: Boolean? = null, encrypted: Boolean? = null) =
        ApiMessageAttachment(id = id, mimeType = mime, fileUrl = "https://cdn/$id", isViewOnce = viewOnce, isBlurred = blurred, isEncrypted = encrypted)

    private fun message(vararg pieces: ApiMessageAttachment, viewOnce: Boolean? = null) =
        ApiMessage(id = "m1", conversationId = "c1", senderId = "u", content = "", attachments = pieces.toList(), isViewOnce = viewOnce)

    @Test
    fun `les pieces defilables sont les photos et videos dans l'ordre du message`() {
        val m = message(piece("a", "image/png"), piece("doc", "application/pdf"), piece("v", "video/mp4"), piece("loc", "application/x-location"))
        assertThat(MessagePieceTarget.pieces(m).map { it.id }).containsExactly("a", "v").inOrder()
    }

    @Test
    fun `la piece visee est celle du message, jamais une inconnue`() {
        val m = message(piece("a", "image/png"), piece("b", "image/png"))
        assertThat(MessagePieceTarget.piece("b", m)?.id).isEqualTo("b")
        assertThat(MessagePieceTarget.piece("ghost", m)).isNull()
        assertThat(MessagePieceTarget.piece(null, m)).isNull()
    }

    @Test
    fun `un message protege n'ouvre jamais l'apercu d'une piece meme sans drapeau sur la piece`() {
        val m = message(piece("a", "image/png"), viewOnce = true)
        assertThat(MessagePieceTarget.messageIsProtected(m)).isTrue()
        assertThat(MessagePieceTarget.piece("a", m)).isNull()
    }

    @Test
    fun `une piece floutee ou a vue unique ou chiffree est protegee`() {
        val m = message(piece("a", "image/png", viewOnce = true), piece("b", "image/png", blurred = true), piece("c", "image/png", encrypted = true), piece("d", "image/png"))
        assertThat(m.attachments.map { MessagePieceTarget.isProtected(it, m) }).containsExactly(true, true, true, true).inOrder()
    }

    @Test
    fun `une piece ordinaire d'un message ordinaire se montre en clair`() {
        val m = message(piece("a", "image/png"))
        assertThat(MessagePieceTarget.isProtected(m.attachments.first(), m)).isFalse()
    }

    @Test
    fun `l'indicateur dit rang sur total, jamais un rang au-dela du total`() {
        assertThat(MessagePieceTarget.position(index = 2, count = 7)).isEqualTo("3/7")
        assertThat(MessagePieceTarget.position(index = 4, count = 2)).isEqualTo("5/5")
    }

    @Test
    fun `le voisin est borne aux pieces du message`() {
        val m = message(piece("a", "image/png"), piece("b", "image/png"))
        assertThat(MessagePieceTarget.neighbour("a", +1, m)).isEqualTo("b")
        assertThat(MessagePieceTarget.neighbour("a", -1, m)).isNull()
        assertThat(MessagePieceTarget.neighbour("b", +1, m)).isNull()
        assertThat(MessagePieceTarget.neighbour("ghost", +1, m)).isNull()
    }

    @Test
    fun `la taille tient dans la scene a son ratio sans etirement ni rognure`() {
        assertThat(MessagePieceTarget.fittedSize(2f, 400f, 400f)).isEqualTo(MessagePieceTarget.Size(400f, 200f))
        assertThat(MessagePieceTarget.fittedSize(0.5f, 400f, 400f)).isEqualTo(MessagePieceTarget.Size(200f, 400f))
        assertThat(MessagePieceTarget.fittedSize(0f, 300f, 500f)).isEqualTo(MessagePieceTarget.Size(300f, 300f))
        assertThat(MessagePieceTarget.fittedSize(1f, 0f, 400f)).isEqualTo(MessagePieceTarget.Size(0f, 0f))
    }

    @Test
    fun `le menu d'une piece ordinaire offre repondre puis le message entier`() {
        val actions = MessagePieceTarget.actions(isProtected = false, canReply = true)
        assertThat(actions).containsExactly(MessagePieceTarget.Action.REPLY, MessagePieceTarget.Action.WHOLE_MESSAGE).inOrder()
    }

    @Test
    fun `une piece protegee ne se cite pas, mais le message entier reste accessible`() {
        assertThat(MessagePieceTarget.actions(isProtected = true, canReply = true)).containsExactly(MessagePieceTarget.Action.WHOLE_MESSAGE)
    }

    @Test
    fun `un lecteur sans le droit d'ecrire ne cite pas la piece`() {
        assertThat(MessagePieceTarget.actions(isProtected = false, canReply = false)).containsExactly(MessagePieceTarget.Action.WHOLE_MESSAGE)
    }
}
