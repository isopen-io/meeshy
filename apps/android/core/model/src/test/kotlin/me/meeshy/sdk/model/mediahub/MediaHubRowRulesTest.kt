package me.meeshy.sdk.model.mediahub

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import org.junit.Test

class MediaHubRowRulesTest {

    private val origin = "https://meeshy.me"

    private fun attachment(kind: ConversationMediaKind, mime: String, video: Boolean = false, encrypted: Boolean = false) =
        MediaHubItem(
            id = "m:a", kind = kind, messageId = "m", sentAtIso = null, sentAtMillis = 0, senderName = "Ada",
            payload = MediaHubPayload.Attachment(
                MediaHubAttachment("a", "https://g/a", null, "a.bin", mime, null, null, video, encrypted, null),
            ),
        )

    private fun link(url: String) = MediaHubItem(
        id = "m:l", kind = ConversationMediaKind.LINK, messageId = "m", sentAtIso = null, sentAtMillis = 0, senderName = "",
        payload = MediaHubPayload.Link(url, "x"),
    )

    @Test
    fun `chaque genre rend la carte du fil`() {
        assertThat(MediaHubRowRules.rendering(attachment(ConversationMediaKind.AUDIO, "audio/mp4"), origin)).isEqualTo(MediaHubRendering.AUDIO)
        assertThat(MediaHubRowRules.rendering(attachment(ConversationMediaKind.CONTACT, "text/vcard"), origin)).isEqualTo(MediaHubRendering.CONTACT_CARD)
        assertThat(MediaHubRowRules.rendering(attachment(ConversationMediaKind.VISUAL, "video/mp4", video = true), origin)).isEqualTo(MediaHubRendering.VIDEO)
        assertThat(MediaHubRowRules.rendering(attachment(ConversationMediaKind.VISUAL, "image/png"), origin)).isEqualTo(MediaHubRendering.IMAGE)
        assertThat(MediaHubRowRules.rendering(attachment(ConversationMediaKind.DOCUMENT, "application/pdf"), origin)).isEqualTo(MediaHubRendering.DOCUMENT)
        assertThat(MediaHubRowRules.rendering(link("https://example.com/a"), origin)).isEqualTo(MediaHubRendering.WEB_LINK)
    }

    @Test
    fun `une pièce chiffrée ne se joue ni ne se lit nulle part`() {
        assertThat(MediaHubRowRules.rendering(attachment(ConversationMediaKind.AUDIO, "audio/mp4", encrypted = true), origin))
            .isEqualTo(MediaHubRendering.DOCUMENT)
    }

    @Test
    fun `le nom d une carte de contact est le fichier sans extension`() {
        assertThat(MediaHubRowRules.contactName("Ada Lovelace.vcf")).isEqualTo("Ada Lovelace")
        assertThat(MediaHubRowRules.contactName("Ada")).isEqualTo("Ada")
    }

    @Test
    fun `un porteur inconnu ferme la sortie et protege la capture`() {
        val exit = MediaHubRowExit.of(carrier = null, conversationIsEncrypted = false)
        assertThat(exit.mayLeave).isFalse()
        assertThat(exit.shieldsCapture).isTrue()
    }

    @Test
    fun `un porteur ordinaire laisse sortir et ne protege rien`() {
        val exit = MediaHubRowExit.of(ApiMessage(id = "m", conversationId = "c", content = "", attachments = emptyList<ApiMessageAttachment>()), false)
        assertThat(exit.mayLeave).isTrue()
        assertThat(exit.shieldsCapture).isFalse()
    }

    @Test
    fun `un porteur ephemere ne laisse rien sortir`() {
        val ephemeral = ApiMessage(id = "m", conversationId = "c", content = "", expiresAt = "2099-01-01T00:00:00.000Z", ephemeralDuration = 30)
        val exit = MediaHubRowExit.of(ephemeral, false)
        assertThat(exit.mayLeave).isFalse()
        assertThat(exit.shieldsCapture).isTrue()
    }

    @Test
    fun `une conversation chiffree ne sort pas son porteur`() {
        val exit = MediaHubRowExit.of(ApiMessage(id = "m", conversationId = "c", content = ""), conversationIsEncrypted = true)
        assertThat(exit.shieldsCapture).isFalse()
    }
}
