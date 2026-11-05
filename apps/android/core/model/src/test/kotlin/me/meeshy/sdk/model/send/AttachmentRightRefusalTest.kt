package me.meeshy.sdk.model.send

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.socket.SocketAckRefusal
import me.meeshy.sdk.model.socket.SocketSendFallbackPolicy
import org.junit.Test

class AttachmentRightRefusalTest {

    @Test
    fun `le code servi par la passerelle est reconnu, aucun autre`() {
        assertThat(AttachmentRightRefusal.isCode("ATTACHMENT_RIGHT_NOT_PERMITTED")).isTrue()
        assertThat(AttachmentRightRefusal.isCode("WRITE_NOT_PERMITTED")).isFalse()
        assertThat(AttachmentRightRefusal.isCode("HTTP_403")).isFalse()
        assertThat(AttachmentRightRefusal.isCode(null)).isFalse()
    }

    @Test
    fun `la raison d'un 403 REST epuise le porte`() {
        assertThat(AttachmentRightRefusal.isReason("Refused: HTTP 403 ATTACHMENT_RIGHT_NOT_PERMITTED")).isTrue()
    }

    @Test
    fun `la raison d'un refus de l'acquittement socket le porte`() {
        assertThat(AttachmentRightRefusal.isReason("Refused: ATTACHMENT_RIGHT_NOT_PERMITTED")).isTrue()
    }

    @Test
    fun `un 403 sans ce code, une page de proxy ou aucune raison ne le portent pas`() {
        assertThat(AttachmentRightRefusal.isReason("Refused: HTTP 403 WRITE_NOT_PERMITTED")).isFalse()
        assertThat(AttachmentRightRefusal.isReason("Refused: HTTP 403")).isFalse()
        assertThat(AttachmentRightRefusal.isReason("Refused: HTTP 403 ATTACHMENT_RIGHT_NOT_PERMITTED_SOON")).isFalse()
        assertThat(AttachmentRightRefusal.isReason(null)).isFalse()
    }

    @Test
    fun `l'acquittement socket qui le porte est un refus definitif`() {
        assertThat(SocketSendFallbackPolicy.isDefinitive(SocketAckRefusal(code = AttachmentRightRefusal.CODE))).isTrue()
    }
}
