package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Le décodage de la pièce jointe servie par la passerelle, par le décodeur RÉEL de
 * l'application (`SdkModule.providesJson`) et non par un objet construit à la main.
 *
 * Trois promesses : (1) rien de ce que le fil sert n'est perdu en route ; (2) un
 * élément malformé ne coûte que lui-même — jamais la pièce, jamais le message ;
 * (3) une ancienne ligne Room, écrite avant ces champs, se relit.
 */
class ApiMessageAttachmentDecodingTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun decode(payload: String): ApiMessageAttachment = json.decodeFromString<ApiMessageAttachment>(payload)

    private val fullPayload = """
        {
          "id": "68d1b2c3a4e5f6a7b8c9d0e1",
          "messageId": "68d1b2c3a4e5f6a7b8c9d0aa",
          "fileName": "IMG_0001.jpg",
          "originalName": "IMG_0001.jpg",
          "mimeType": "image/jpeg",
          "fileSize": 4200000,
          "fileUrl": "/uploads/IMG_0001.jpg",
          "thumbnailUrl": "/uploads/IMG_0001.thumb.jpg",
          "thumbHash": "3OcRJYB4d3h/iIeHeEh3eIhw+j3A",
          "width": 4000,
          "height": 3000,
          "imageVariants": [
            {"width":640,"height":480,"url":"/v/640.webp","size":42000,"format":"webp"},
            {"width":1080,"height":810,"url":"/v/1080.webp","size":120000,"format":"webp"}
          ],
          "reactionSummary": {"❤️": 2, "🔥": 1},
          "currentUserReactions": ["❤️"],
          "currentUserConsumption": {
            "lastPlayPositionMs": 4500, "listenedComplete": true,
            "lastWatchPositionMs": null, "watchedComplete": false
          },
          "duration": 61000,
          "bitrate": 128000,
          "sampleRate": 44100,
          "codec": "opus",
          "channels": 2,
          "fps": 29.97,
          "videoCodec": "h264",
          "pageCount": 12,
          "lineCount": 340,
          "latitude": 48.85,
          "longitude": 2.35,
          "uploadedBy": "68d1b2c3a4e5f6a7b8c9d0ff",
          "isAnonymous": false,
          "createdAt": "2026-10-20T10:00:00.000Z",
          "forwardedFromAttachmentId": "68d1b2c3a4e5f6a7b8c9d0ee",
          "isForwarded": true,
          "capturedInApp": true,
          "isViewOnce": true,
          "maxViewOnceCount": 1,
          "viewOnceCount": 0,
          "isBlurred": false,
          "effectFlags": 4,
          "deliveredToAllAt": "2026-10-20T10:00:05.000Z",
          "viewedByAllAt": "2026-10-20T10:01:00.000Z",
          "downloadedByAllAt": null,
          "listenedByAllAt": "2026-10-20T10:02:00.000Z",
          "watchedByAllAt": null,
          "viewedCount": 3,
          "downloadedCount": 1,
          "consumedCount": 2,
          "isEncrypted": true,
          "encryptionMode": "e2ee",
          "encryptionIv": "aXY=",
          "encryptionAuthTag": "dGFn",
          "scanStatus": "clean",
          "metadata": {"anything": [1, 2, 3]},
          "alt": "Un chat sur un canapé"
        }
    """.trimIndent()

    @Test
    fun `a full payload keeps every property the gateway serves`() {
        val a = decode(fullPayload)

        assertThat(a.id).isEqualTo("68d1b2c3a4e5f6a7b8c9d0e1")
        assertThat(a.messageId).isEqualTo("68d1b2c3a4e5f6a7b8c9d0aa")
        assertThat(a.width).isEqualTo(4000)
        assertThat(a.height).isEqualTo(3000)
        assertThat(a.thumbHash).isEqualTo("3OcRJYB4d3h/iIeHeEh3eIhw+j3A")
        assertThat(a.alt).isEqualTo("Un chat sur un canapé")

        assertThat(a.bitrate).isEqualTo(128000)
        assertThat(a.sampleRate).isEqualTo(44100)
        assertThat(a.codec).isEqualTo("opus")
        assertThat(a.channels).isEqualTo(2)
        assertThat(a.fps).isWithin(0.0001).of(29.97)
        assertThat(a.videoCodec).isEqualTo("h264")
        assertThat(a.pageCount).isEqualTo(12)
        assertThat(a.lineCount).isEqualTo(340)

        assertThat(a.uploadedBy).isEqualTo("68d1b2c3a4e5f6a7b8c9d0ff")
        assertThat(a.isAnonymous).isFalse()
        assertThat(a.createdAt).isEqualTo("2026-10-20T10:00:00.000Z")
        assertThat(a.forwardedFromAttachmentId).isEqualTo("68d1b2c3a4e5f6a7b8c9d0ee")
        assertThat(a.isForwarded).isTrue()
        assertThat(a.capturedInApp).isTrue()
    }

    @Test
    fun `a full payload keeps protection, encryption envelope and receipts`() {
        val a = decode(fullPayload)

        assertThat(a.isViewOnce).isTrue()
        assertThat(a.maxViewOnceCount).isEqualTo(1)
        assertThat(a.viewOnceCount).isEqualTo(0)
        assertThat(a.isBlurred).isFalse()
        assertThat(a.effectFlags).isEqualTo(4L)
        assertThat(a.protectionVerdict).isEqualTo(AttachmentProtectionVerdict.Masked)

        assertThat(a.isEncrypted).isTrue()
        assertThat(a.encryptionMode).isEqualTo("e2ee")
        assertThat(a.encryptionIv).isEqualTo("aXY=")
        assertThat(a.encryptionAuthTag).isEqualTo("dGFn")

        assertThat(a.deliveredToAllAt).isEqualTo("2026-10-20T10:00:05.000Z")
        assertThat(a.viewedByAllAt).isEqualTo("2026-10-20T10:01:00.000Z")
        assertThat(a.downloadedByAllAt).isNull()
        assertThat(a.listenedByAllAt).isEqualTo("2026-10-20T10:02:00.000Z")
        assertThat(a.watchedByAllAt).isNull()
        assertThat(a.viewedCount).isEqualTo(3)
        assertThat(a.downloadedCount).isEqualTo(1)
        assertThat(a.consumedCount).isEqualTo(2)
    }

    @Test
    fun `a full payload keeps the responsive variants, the reactions and the reader consumption`() {
        val a = decode(fullPayload)

        assertThat(a.imageVariants).containsExactly(
            MeeshyImageVariant(640, 480, "/v/640.webp", 42000, "webp"),
            MeeshyImageVariant(1080, 810, "/v/1080.webp", 120000, "webp"),
        ).inOrder()
        assertThat(a.reactionSummary).containsExactly("❤️", 2, "🔥", 1)
        assertThat(a.currentUserReactions).containsExactly("❤️")
        assertThat(a.currentUserConsumption).isEqualTo(
            MeeshyMediaConsumption(
                lastPlayPositionMs = 4500,
                listenedComplete = true,
                lastWatchPositionMs = null,
                watchedComplete = false,
            ),
        )
    }

    // ── Variantes malformées ─────────────────────────────────────────────────

    private val mixedVariants = """
        [
          {"width":640,"height":480,"url":"https://cdn.meeshy.me/x-640.webp","size":40000,"format":"webp"},
          {"width":1280,"height":960,"url":"https://cdn.meeshy.me/x-1280.webp"},
          {"width":1920,"height":1440,"url":"https://cdn.meeshy.me/x-1920.webp","size":300000},
          "not-a-variant",
          {"width":"wide","height":1,"url":"u","size":1}
        ]
    """.trimIndent()

    @Test
    fun `a malformed variant is dropped and the attachment still decodes`() {
        val a = decode("""{"id":"a1","mimeType":"image/jpeg","fileUrl":"/x.jpg","imageVariants":$mixedVariants}""")

        assertThat(a.id).isEqualTo("a1")
        assertThat(a.fileUrl).isEqualTo("/x.jpg")
        assertThat(a.imageVariants?.map { it.url }).containsExactly(
            "https://cdn.meeshy.me/x-640.webp",
            "https://cdn.meeshy.me/x-1920.webp",
        ).inOrder()
    }

    @Test
    fun `a variant without format falls back to webp inside the decoding`() {
        val a = decode(
            """{"id":"a1","imageVariants":[{"width":1920,"height":1440,"url":"/x.webp","size":300000}]}""",
        )
        assertThat(a.imageVariants?.single()?.format).isEqualTo("webp")
    }

    @Test
    fun `an absent key stays null and never becomes an invented empty list`() {
        assertThat(decode("""{"id":"a1"}""").imageVariants).isNull()
        assertThat(decode("""{"id":"a1","imageVariants":null}""").imageVariants).isNull()
    }

    @Test
    fun `every variant malformed leaves an empty list and the attachment decodes`() {
        val a = decode("""{"id":"a1","imageVariants":[{"width":640},{"nope":true}]}""")
        assertThat(a.imageVariants).isEmpty()
    }

    @Test
    fun `variants that are not an array leave null`() {
        assertThat(decode("""{"id":"a1","imageVariants":{"width":640}}""").imageVariants).isNull()
    }

    // ── Blobs du Prisme et décorations malformés ─────────────────────────────

    @Test
    fun `a malformed transcription costs only the transcription`() {
        val a = decode("""{"id":"a1","mimeType":"audio/mp4","duration":3000,"transcription":"half written"}""")
        assertThat(a.transcription).isNull()
        assertThat(a.duration).isEqualTo(3000)
    }

    @Test
    fun `malformed translations cost only the translations`() {
        val a = decode(
            """{"id":"a1","mimeType":"audio/mp4","translations":{"en":{"url":42,"segments":"x"}},"fileUrl":"/a.m4a"}""",
        )
        assertThat(a.translations).isNull()
        assertThat(a.fileUrl).isEqualTo("/a.m4a")
    }

    @Test
    fun `a well formed transcription and translations still decode`() {
        val a = decode(
            """
            {"id":"a1","mimeType":"audio/mp4",
             "transcription":{"text":"bonjour","language":"fr","durationMs":3000},
             "translations":{"en":{"type":"audio","url":"/en.m4a","transcription":"hello","durationMs":3100}}}
            """.trimIndent(),
        )
        assertThat(a.transcription?.text).isEqualTo("bonjour")
        assertThat(a.translations?.get("en")?.url).isEqualTo("/en.m4a")
        assertThat(a.translations?.get("en")?.transcription).isEqualTo("hello")
    }

    @Test
    fun `malformed reactions and consumption cost only themselves`() {
        val a = decode(
            """
            {"id":"a1","width":10,
             "reactionSummary":{"❤️":"two"},
             "currentUserReactions":"❤️",
             "currentUserConsumption":{"listenedComplete":"maybe"}}
            """.trimIndent(),
        )
        assertThat(a.width).isEqualTo(10)
        assertThat(a.reactionSummary).isNull()
        assertThat(a.currentUserReactions).isNull()
        assertThat(a.currentUserConsumption).isNull()
    }

    // ── Ancienne ligne Room ──────────────────────────────────────────────────

    /** La forme exacte que le modèle d'AVANT écrivait dans `MessageEntity.payload`. */
    private val oldRoomRow = """
        {"id":"a1","fileName":"x.jpg","originalName":"x.jpg","mimeType":"image/jpeg","fileSize":1200,
         "fileUrl":"/x.jpg","thumbnailUrl":"/x.thumb.jpg","thumbHash":"abc","width":800,"height":600,
         "duration":null,"alt":"un chat"}
    """.trimIndent()

    @Test
    fun `an old cache row without the new fields is read again`() {
        val a = decode(oldRoomRow)

        assertThat(a.id).isEqualTo("a1")
        assertThat(a.fileUrl).isEqualTo("/x.jpg")
        assertThat(a.width).isEqualTo(800)
        assertThat(a.alt).isEqualTo("un chat")
        assertThat(a.imageVariants).isNull()
        assertThat(a.isViewOnce).isNull()
        assertThat(a.isBlurred).isNull()
        assertThat(a.effectFlags).isNull()
        assertThat(a.encryptionIv).isNull()
        assertThat(a.reactionSummary).isNull()
        assertThat(a.currentUserConsumption).isNull()
        assertThat(a.viewedCount).isNull()
    }

    @Test
    fun `an old row is not a proven ordinary attachment - its protection is undeclared`() {
        val a = decode(oldRoomRow)
        assertThat(a.protectionVerdict).isEqualTo(AttachmentProtectionVerdict.Undeclared)
        assertThat(a.isProtected).isTrue()
    }

    @Test
    fun `an old row in a message without attachments is untouched`() {
        val message = json.decodeFromString<ApiMessage>(
            """{"id":"m1","conversationId":"c1","content":"salut","messageType":"text"}""",
        )
        assertThat(message.attachments).isEmpty()
        assertThat(message.content).isEqualTo("salut")
    }

    @Test
    fun `a message carrying the full attachment decodes through the real message model`() {
        val message = json.decodeFromString<ApiMessage>(
            """{"id":"m1","conversationId":"c1","content":"","attachments":[$fullPayload]}""",
        )
        assertThat(message.attachments.single().imageVariants).hasSize(2)
        assertThat(message.attachments.single().encryptionIv).isEqualTo("aXY=")
    }

    @Test
    fun `the cache round trip keeps every property`() {
        val once = decode(fullPayload)
        val twice = json.decodeFromString<ApiMessageAttachment>(
            json.encodeToString(ApiMessageAttachment.serializer(), once),
        )
        assertThat(twice).isEqualTo(once)
    }

    @Test
    fun `a minimal attachment encodes to its minimal shape so cached payloads keep their size`() {
        val encoded = json.encodeToString(
            ApiMessageAttachment.serializer(),
            ApiMessageAttachment(id = "a1", mimeType = "image/png"),
        )
        assertThat(encoded).isEqualTo("""{"id":"a1","mimeType":"image/png"}""")
    }

    // ── Listes tolérantes ────────────────────────────────────────────────────

    @Test
    fun `the attachment list serializer drops a piece that has no id and keeps the rest in order`() {
        val list = json.decodeFromString(
            LossyApiMessageAttachmentListSerializer,
            """[{"id":"a1"},{"mimeType":"image/png"},{"id":"a3","mimeType":"video/mp4"},42]""",
        )
        assertThat(list.map { it.id }).containsExactly("a1", "a3").inOrder()
    }

    @Test
    fun `a forwarded message survives a broken attachment`() {
        val forwarded = json.decodeFromString<ApiForwardedFrom>(
            """{"id":"m9","content":"fwd","attachments":[{"id":"a1","mimeType":"image/png"},{"fileName":"orphan"}]}""",
        )
        assertThat(forwarded.attachments?.map { it.id }).containsExactly("a1")
    }

    @Test
    fun `a forwarded message without attachments keeps null`() {
        val forwarded = json.decodeFromString<ApiForwardedFrom>("""{"id":"m9","content":"fwd"}""")
        assertThat(forwarded.attachments).isNull()
    }

    // ── Le modèle de domaine ─────────────────────────────────────────────────

    @Test
    fun `an old domain attachment blob without the new fields is read again`() {
        val old = json.decodeFromString<MeeshyMessageAttachment>(
            """{"id":"d1","fileName":"x.jpg","mimeType":"image/jpeg","fileSize":1200,"isViewOnce":true,"width":800}""",
        )
        assertThat(old.isViewOnce).isTrue()
        assertThat(old.capturedInApp).isFalse()
        assertThat(old.effectFlags).isNull()
        assertThat(old.imageVariants).isNull()
        assertThat(old.reactionSummary).isNull()
        assertThat(old.currentUserConsumption).isNull()
    }

    @Test
    fun `a domain attachment blob with a partial variant is read again without it`() {
        val a = json.decodeFromString<MeeshyMessageAttachment>(
            """{"id":"d1","mimeType":"image/jpeg","imageVariants":$mixedVariants,"effectFlags":2}""",
        )
        assertThat(a.imageVariants).hasSize(2)
        assertThat(a.effectFlags).isEqualTo(2L)
        assertThat(a.protectionVerdict).isEqualTo(AttachmentProtectionVerdict.Masked)
    }

    @Test
    fun `a domain attachment round trips with the new properties`() {
        val attachment = MeeshyMessageAttachment(
            id = "d1",
            mimeType = "image/jpeg",
            capturedInApp = true,
            effectFlags = MessageEffectFlags.BLURRED,
            imageVariants = listOf(MeeshyImageVariant(640, 480, "/v/640.webp", 42000)),
            reactionSummary = mapOf("🔥" to 2),
            currentUserReactions = listOf("🔥"),
            viewedCount = 3,
            currentUserConsumption = MeeshyMediaConsumption(lastPlayPositionMs = 10, listenedComplete = true),
        )
        val again = json.decodeFromString<MeeshyMessageAttachment>(
            json.encodeToString(MeeshyMessageAttachment.serializer(), attachment),
        )
        assertThat(again).isEqualTo(attachment)
    }
}
