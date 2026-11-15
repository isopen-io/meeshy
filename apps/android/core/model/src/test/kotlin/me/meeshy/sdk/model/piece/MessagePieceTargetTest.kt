package me.meeshy.sdk.model.piece

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.sdk.model.MessageExitOffer
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

    private fun menu(
        isProtected: Boolean = false,
        exits: MessageExitOffer = MessageExitOffer.Unrestricted,
        canDelete: Boolean = false,
        canForward: Boolean = true,
        canReply: Boolean = true,
        canReact: Boolean = true,
        canCopy: Boolean = true,
    ) = MessagePieceTarget.MenuContext(isProtected, exits, canDelete, canForward, canReply, canReact, canCopy)

    private val blurredExits = MessageExitOffer(ContentExitLaw.Ordinary, holdsBlur = true, isEncrypted = false)

    @Test
    fun `le menu complet d'une piece ordinaire suit l'ordre d'iOS puis ferme sur le message entier`() {
        val actions = MessagePieceTarget.actions(menu(canDelete = true))
        assertThat(actions).containsExactly(
            MessagePieceTarget.Action.REPLY, MessagePieceTarget.Action.FORWARD, MessagePieceTarget.Action.SAVE,
            MessagePieceTarget.Action.COPY, MessagePieceTarget.Action.DELETE, MessagePieceTarget.Action.WHOLE_MESSAGE,
        ).inOrder()
    }

    @Test
    fun `une piece protegee n'offre ni citation, ni transfert, ni enregistrement, ni copie`() {
        val actions = MessagePieceTarget.actions(menu(isProtected = true, canDelete = true))
        assertThat(actions).containsExactly(MessagePieceTarget.Action.DELETE, MessagePieceTarget.Action.WHOLE_MESSAGE).inOrder()
    }

    @Test
    fun `la suppression suit le droit de l'utilisateur, protegee ou non`() {
        assertThat(MessagePieceTarget.actions(menu(canDelete = false))).doesNotContain(MessagePieceTarget.Action.DELETE)
        assertThat(MessagePieceTarget.actions(menu(isProtected = true, canDelete = true))).contains(MessagePieceTarget.Action.DELETE)
    }

    @Test
    fun `la loi de sortie du message ferme le transfert, l'enregistrement et la copie d'une piece`() {
        val actions = MessagePieceTarget.actions(menu(exits = blurredExits, canDelete = true))
        assertThat(actions).containsExactly(
            MessagePieceTarget.Action.REPLY, MessagePieceTarget.Action.FORWARD, MessagePieceTarget.Action.DELETE, MessagePieceTarget.Action.WHOLE_MESSAGE,
        ).inOrder()
    }

    @Test
    fun `le verdict canForward de la loi partagee ferme le transfert`() {
        assertThat(MessagePieceTarget.actions(menu(canForward = false))).doesNotContain(MessagePieceTarget.Action.FORWARD)
    }

    @Test
    fun `un lecteur sans le droit d'ecrire ne cite pas mais garde enregistrer et copier`() {
        val actions = MessagePieceTarget.actions(menu(canReply = false))
        assertThat(actions).doesNotContain(MessagePieceTarget.Action.REPLY)
        assertThat(actions).contains(MessagePieceTarget.Action.SAVE)
    }

    @Test
    fun `la bande de reactions suit le verdict canReact et ne se montre jamais sur une piece protegee`() {
        assertThat(MessagePieceTarget.offersReaction(menu())).isTrue()
        assertThat(MessagePieceTarget.offersReaction(menu(canReact = false))).isFalse()
        assertThat(MessagePieceTarget.offersReaction(menu(isProtected = true))).isFalse()
    }
}

class MessagePieceTargetSealedTest {
    @Test
    fun `un blob e2ee sans drapeau chiffre est protege et un message scelle n'ouvre aucun apercu`() {
        val blob = ApiMessageAttachment(id = "a", mimeType = "image/png", fileUrl = "https://cdn/a", encryptionMode = "e2ee")
        val m = ApiMessage(id = "m", conversationId = "c", senderId = "u", content = "", attachments = listOf(blob))
        assertThat(MessagePieceTarget.isProtected(blob, m)).isTrue()
        assertThat(MessagePieceTarget.piece("a", m)).isNull()
        val sealedMessage = ApiMessage(
            id = "m2", conversationId = "c", senderId = "u", content = "[Encrypted]", isEncrypted = true, encryptionMode = "e2ee",
            attachments = listOf(ApiMessageAttachment(id = "b", mimeType = "image/png", fileUrl = "https://cdn/b")),
        )
        assertThat(MessagePieceTarget.messageIsProtected(sealedMessage)).isTrue()
    }
}
