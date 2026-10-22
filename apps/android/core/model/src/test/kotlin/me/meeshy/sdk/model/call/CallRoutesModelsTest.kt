package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/** Les corps et charges REST d'appel, tels que `MeeshyApi.json` (défauts non encodés, nuls omis) les écrit. */
class CallRoutesModelsTest {

    private val wire = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    @Test
    fun `initiating a call writes the lowercase kind the gateway enumerates`() {
        val audio = wire.encodeToString(
            InitiateCallRequest.serializer(),
            InitiateCallRequest(conversationId = "c1", type = InitiateCallKind.AUDIO),
        )
        val video = wire.encodeToString(
            InitiateCallRequest.serializer(),
            InitiateCallRequest(conversationId = "c1", type = InitiateCallKind.VIDEO),
        )

        assertThat(audio).isEqualTo("""{"conversationId":"c1","type":"audio"}""")
        assertThat(video).isEqualTo("""{"conversationId":"c1","type":"video"}""")
    }

    @Test
    fun `initial media settings are written only when provided`() {
        val body = wire.encodeToString(
            InitiateCallRequest.serializer(),
            InitiateCallRequest(
                conversationId = "c1",
                type = InitiateCallKind.VIDEO,
                settings = CallMediaSettings(audioEnabled = true, videoEnabled = false),
            ),
        )

        assertThat(body).isEqualTo(
            """{"conversationId":"c1","type":"video","settings":{"audioEnabled":true,"videoEnabled":false}}""",
        )
    }

    /** Le corps de `POST /calls/{id}/participants` est optionnel : un objet vide est valide, `null` ne l'est pas. */
    @Test
    fun `joining without settings sends an empty object`() {
        assertThat(wire.encodeToString(JoinCallRequest.serializer(), JoinCallRequest())).isEqualTo("{}")
    }

    @Test
    fun `joining carries only audio and video settings`() {
        val body = wire.encodeToString(
            JoinCallRequest.serializer(),
            JoinCallRequest(JoinCallSettings(audioEnabled = false)),
        )

        assertThat(body).isEqualTo("""{"settings":{"audioEnabled":false}}""")
    }

    /** `.strict()` côté serveur : tout champ de plus est un 400. */
    @Test
    fun `linking a recording writes the attachment id and nothing else`() {
        val body = wire.encodeToString(
            CallRecordingLinkRequest.serializer(),
            CallRecordingLinkRequest(attachmentId = "att1"),
        )

        assertThat(body).isEqualTo("""{"attachmentId":"att1"}""")
    }

    @Test
    fun `a recording link decodes the served identifiers`() {
        val link = wire.decodeFromString(
            CallRecordingLink.serializer(),
            """{"recordingId":"r1","messageId":"m1","attachmentId":"a1","kind":"audio"}""",
        )

        assertThat(link).isEqualTo(CallRecordingLink("r1", "m1", "a1", "audio"))
    }

    @Test
    fun `a transcript page decodes segments with their translations`() {
        val page = wire.decodeFromString(
            CallTranscriptPage.serializer(),
            """
            {"callId":"call1","conversationId":"conv1","callStartedAt":"2026-10-01T10:00:00.000Z",
             "total":2,"hasMore":true,"segments":[
               {"id":"s1","speakerId":"u1","speakerDisplayName":"Alice","text":"Bonjour","language":"fr",
                "confidence":0.93,"capturedAtMs":1790000000000,
                "translations":[{"targetLanguage":"en","translatedText":"Hello"}]},
               {"id":"s2","speakerId":"u2","text":"Hi","language":"en","capturedAtMs":1790000001000}
             ]}
            """.trimIndent(),
        )

        assertThat(page.total).isEqualTo(2)
        assertThat(page.hasMore).isTrue()
        assertThat(page.segments.map { it.id }).containsExactly("s1", "s2").inOrder()
        assertThat(page.segments[0].translations.single().translatedText).isEqualTo("Hello")
        assertThat(page.segments[1].translations).isEmpty()
        assertThat(page.segments[1].speakerDisplayName).isNull()
    }

    /** Une transcription est une donnée sensible : ni `toString` ni un journal ne doivent la rendre. */
    @Test
    fun `a transcript page never prints what was said`() {
        val page = CallTranscriptPage(
            callId = "call1",
            conversationId = "conv1",
            total = 1,
            segments = listOf(
                PersistedTranscriptSegment(
                    id = "s1",
                    speakerId = "u1",
                    text = "mot de passe: hunter2",
                    language = "fr",
                    capturedAtMs = 1L,
                ),
            ),
        )

        assertThat(page.toString()).doesNotContain("hunter2")
        assertThat(page.toString()).contains("segments=1")
    }

    @Test
    fun `history removal and clearing decode their data objects`() {
        assertThat(
            wire.decodeFromString(CallHistoryRemoval.serializer(), """{"callId":"c1","hidden":true}"""),
        ).isEqualTo(CallHistoryRemoval("c1", true))
        assertThat(
            wire.decodeFromString(CallHistoryCleared.serializer(), """{"cleared":7}"""),
        ).isEqualTo(CallHistoryCleared(7))
    }
}
