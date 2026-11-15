package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import org.junit.Test

class FullscreenPieceReplyTest {

    private fun piece(id: String = "a1", isViewOnce: Boolean? = null, isEncrypted: Boolean? = null) = ApiMessageAttachment(
        id = id,
        mimeType = "audio/mp4",
        fileUrl = "https://cdn.meeshy.me/$id.m4a",
        isViewOnce = isViewOnce,
        isEncrypted = isEncrypted,
    )

    private fun carrier(
        attachments: List<ApiMessageAttachment> = listOf(piece()),
        isViewOnce: Boolean? = null,
        isBlurred: Boolean? = null,
    ) = ApiMessage(
        id = "m1",
        conversationId = "c1",
        messageType = "audio",
        attachments = attachments,
        isViewOnce = isViewOnce,
        isBlurred = isBlurred,
    )

    private fun admit(
        text: String = "bien reçu",
        carrier: ApiMessage? = carrier(),
        pieceId: String = "a1",
        conversationIsEncrypted: Boolean = false,
    ) = FullscreenPieceReply.admit(text, carrier, pieceId, conversationIsEncrypted)

    @Test
    fun `une reponse admise cite le message porteur et la piece regardee`() {
        val admission = admit(text = "  bien reçu \n")

        assertThat(admission).isEqualTo(FullscreenPieceReply.Admission(replyToId = "m1", attachmentReplyToId = "a1", text = "bien reçu"))
    }

    @Test
    fun `un texte vide ou fait d'espaces ne part pas`() {
        assertThat(admit(text = "")).isNull()
        assertThat(admit(text = "  \n\t ")).isNull()
    }

    @Test
    fun `sans porteur, rien ne part`() {
        assertThat(admit(carrier = null)).isNull()
    }

    @Test
    fun `un porteur qui ne porte pas la piece est refuse - la passerelle refuserait le couple`() {
        assertThat(admit(pieceId = "autre")).isNull()
    }

    @Test
    fun `une piece ou un message protege ne se cite jamais, meme si le bouton etait la`() {
        assertThat(admit(carrier = carrier(isViewOnce = true))).isNull()
        assertThat(admit(carrier = carrier(isBlurred = true))).isNull()
        assertThat(admit(carrier = carrier(attachments = listOf(piece(isViewOnce = true))))).isNull()
        assertThat(admit(carrier = carrier(attachments = listOf(piece(isEncrypted = true))))).isNull()
    }

    @Test
    fun `une conversation chiffree de bout en bout ne recoit aucun clair`() {
        assertThat(admit(conversationIsEncrypted = true)).isNull()
    }
}
