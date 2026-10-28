package me.meeshy.sdk.model.piece

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import org.junit.Test

class PieceSealingTest {

    private fun piece(id: String = "a", encrypted: Boolean? = null, mode: String? = null) =
        ApiMessageAttachment(id = id, mimeType = "application/pdf", fileUrl = "https://cdn/$id", isEncrypted = encrypted, encryptionMode = mode)

    private fun message(vararg pieces: ApiMessageAttachment, encrypted: Boolean? = null, mode: String? = null, content: String = "") =
        ApiMessage(id = "m", conversationId = "c", senderId = "u", content = content, attachments = pieces.toList(), isEncrypted = encrypted, encryptionMode = mode)

    @Test
    fun `une piece marquee chiffree est scellee meme sans mode e2ee`() {
        assertThat(PieceSealing.isSealed(piece(encrypted = true))).isTrue()
    }

    @Test
    fun `un blob e2ee est scelle meme sans drapeau chiffre`() {
        assertThat(PieceSealing.isSealed(piece(mode = "E2EE"))).isTrue()
    }

    @Test
    fun `une piece ordinaire n'est pas scellee`() {
        assertThat(PieceSealing.isSealed(piece(encrypted = false, mode = "server"))).isFalse()
    }

    @Test
    fun `un message scelle retient toutes ses pieces`() {
        val sealed = message(piece(), encrypted = true, mode = "e2ee")
        assertThat(PieceSealing.withholds(sealed.attachments.first(), sealed, conversationIsEncrypted = false)).isTrue()
    }

    @Test
    fun `un message dont une piece est scellee est scelle`() {
        val m = message(piece("a"), piece("b", encrypted = true))
        assertThat(PieceSealing.messageIsSealed(m)).isTrue()
    }

    @Test
    fun `une piece ordinaire d'un message ordinaire sort`() {
        val m = message(piece())
        assertThat(PieceSealing.withholds(m.attachments.first(), m, conversationIsEncrypted = false)).isFalse()
    }

    @Test
    fun `dans une conversation chiffree l'absence d'information ferme la porte`() {
        val m = message(piece())
        assertThat(PieceSealing.withholds(null, m, conversationIsEncrypted = true)).isTrue()
        assertThat(PieceSealing.withholds(piece(), null, conversationIsEncrypted = true)).isTrue()
    }

    @Test
    fun `hors conversation chiffree une piece sans porteur connu n'est pas retenue par ce seul motif`() {
        assertThat(PieceSealing.withholds(piece(), null, conversationIsEncrypted = false)).isFalse()
    }
}
