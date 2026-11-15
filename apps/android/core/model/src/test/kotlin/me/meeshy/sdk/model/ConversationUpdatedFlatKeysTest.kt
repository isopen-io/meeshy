package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.preview.PreviewFieldUpdate
import org.junit.Test

class ConversationUpdatedFlatKeysTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun decode(extra: String) = json.decodeFromString(
        ConversationUpdatedSocketEvent.serializer(),
        """{"conversationId":"c1"$extra}""",
    )

    @Test
    fun `les cles plates deviennent nature, pieces, lieu, expiration, vue unique et flou`() {
        val e = decode(
            ""","lastMessageId":"m1","lastMessagePreview":"salut","lastMessageType":"image",
               "lastMessageEffectFlags":2,"lastMessageEphemeralDuration":60,"lastMessageIsEncrypted":true,
               "lastMessageIsForwarded":true,"lastMessageAttachmentCount":2,
               "lastMessageIsBlurred":true,"lastMessageIsViewOnce":true,"lastMessageExpiresAt":"2026-10-01T10:00:00.000Z",
               "lastMessageAttachments":[{"id":"a1","mimeType":"image/png","thumbnailUrl":"t"},{"bad":true}],
               "location":{"latitude":1.5,"longitude":2.5},
               "lastMessageAttachmentSummary":{"count":2,"kinds":{"image":2}},
               "lastMessageCallSummary":{"callId":"k","kind":"audio","outcome":"completed","durationSec":12,"initiatorId":"u"},
               "lastMessageSystemEvent":{"key":"system.k","params":{"n":1}},
               "lastMessageSticker":{"emoji":"x"}""",
        )
        val nature = checkNotNull(e.lastMessageNature)

        assertThat(e.lastMessageId).isEqualTo(PreviewFieldUpdate.Replaced("m1"))
        assertThat(nature.messageType).isEqualTo("image")
        assertThat(nature.effectFlags).isEqualTo(2)
        assertThat(nature.ephemeralDuration).isEqualTo(60)
        assertThat(nature.isEncrypted).isTrue()
        assertThat(nature.isForwarded).isTrue()
        assertThat(nature.attachmentSummary?.count).isEqualTo(2)
        assertThat(nature.callSummary?.durationSec).isEqualTo(12)
        assertThat(nature.systemEvent?.key).isEqualTo("system.k")
        assertThat(nature.sticker?.emoji).isEqualTo("x")
        assertThat(e.lastMessageAttachments?.map { it.id }).containsExactly("a1")
        assertThat(e.lastMessageAttachmentCount).isEqualTo(2)
        assertThat(e.lastMessageIsBlurred).isTrue()
        assertThat(e.lastMessageIsViewOnce).isTrue()
        assertThat(e.lastMessageExpiresAt).isEqualTo("2026-10-01T10:00:00.000Z")
        assertThat(e.location?.latitude).isEqualTo(1.5)
    }

    @Test
    fun `une cle absente laisse inchange et une cle nulle vide`() {
        val absent = decode("")
        val nulled = decode(""","lastMessageId":null,"lastReaction":null,"activeCall":null,"lastMessageTranslations":null""")

        assertThat(absent.lastMessageId).isEqualTo(PreviewFieldUpdate.Unchanged)
        assertThat(absent.lastReaction).isEqualTo(PreviewFieldUpdate.Unchanged)
        assertThat(absent.activeCall).isEqualTo(PreviewFieldUpdate.Unchanged)
        assertThat(absent.lastMessageNature).isNull()
        assertThat(nulled.lastMessageId).isEqualTo(PreviewFieldUpdate.Replaced<String>(null))
        assertThat(nulled.lastReaction).isEqualTo(PreviewFieldUpdate.Replaced(null))
        assertThat(nulled.activeCall).isEqualTo(PreviewFieldUpdate.Replaced(null))
        assertThat(nulled.lastMessageTranslations).isEqualTo(PreviewFieldUpdate.Replaced(null))
    }

    @Test
    fun `une reaction et un appel presents se decodent, une forme inattendue vide sans jeter l'evenement`() {
        val good = decode(
            ""","lastReaction":{"emoji":"x","reactorId":"p","reactorName":"A","messageId":"m","createdAt":"2026-10-01T10:00:00.000Z"},
               "activeCall":{"id":"k","kind":"video","participantCount":2,"startedAt":"2026-10-01T10:00:00.000Z"}""",
        )
        val bad = decode(""","lastReaction":7,"activeCall":{"id":1},"listRankAt":"2026-10-01T10:00:00.000Z"""")

        assertThat(good.lastReaction.valueOrNull?.emoji).isEqualTo("x")
        assertThat(good.activeCall.valueOrNull?.participantCount).isEqualTo(2)
        assertThat(bad.lastReaction).isEqualTo(PreviewFieldUpdate.Replaced(null))
        assertThat(bad.activeCall).isEqualTo(PreviewFieldUpdate.Replaced(null))
        assertThat(bad.listRankAt).isEqualTo("2026-10-01T10:00:00.000Z")
    }

    @Test
    fun `la carte du Prisme et le nom d'auteur gardent leur tri-etat`() {
        val e = decode(""","lastMessageTranslations":{"fr":"salut"},"lastMessageSenderName":null,"lastMessageOriginalLanguage":"en"""")

        assertThat(e.lastMessageTranslations.valueOrNull).containsExactly("fr", "salut")
        assertThat(e.lastMessageSenderName).isEqualTo(PreviewFieldUpdate.Replaced<String>(null))
        assertThat(e.lastMessageOriginalLanguage).isEqualTo("en")
    }

    @Test
    fun `un evenement de metadonnees seules se decode comme avant`() {
        val e = decode(""","title":"Nouveau","avatar":"u","updatedAt":"2026-10-01T10:00:00.000Z"""")

        assertThat(e.title).isEqualTo("Nouveau")
        assertThat(e.previewRecalculated).isFalse()
    }
}
