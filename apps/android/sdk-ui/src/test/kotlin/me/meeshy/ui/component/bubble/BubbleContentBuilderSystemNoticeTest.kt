package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import org.junit.Test

class BubbleContentBuilderSystemNoticeTest {

    private class Prefs(override val systemLanguage: String?) : LanguageResolver.ContentLanguagePreferences {
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private fun notice(metadata: String, source: String? = "system", content: String = "repli"): ApiMessage =
        ApiMessage(
            id = "m1",
            conversationId = "c1",
            senderId = "p1",
            content = content,
            originalLanguage = "fr",
            messageSource = source,
            metadata = Json.parseToJsonElement(metadata) as JsonObject,
        )

    private fun build(message: ApiMessage, language: String = "fr", zone: String = "Europe/Paris") =
        BubbleContentBuilder.build(
            message = message,
            currentUserId = "me",
            preferences = Prefs(language),
            readerLanguage = language,
            readerTimeZoneId = zone,
        )

    private val capture = """{"kind":"content-capture","actor":{"participantId":"p1","displayName":"Alice","isAnonymous":false},
        "capturedMessageId":"m0","nature":"timed-flame","outcome":"announced","captureKind":"screenshot",
        "sentAt":"2026-10-07T12:05:00Z"}"""

    @Test
    fun `a capture notice is a system line composed in the reader language and zone`() {
        val content = build(notice(capture))
        assertThat(content.isSystem).isTrue()
        assertThat(content.text).isEqualTo("Alice a capturé l’éphémère du 07/10/2026 à 14:05")
        assertThat(build(notice(capture), language = "en", zone = "UTC").text).contains("12:05")
    }

    @Test
    fun `a false capture shape falls back on the stored text`() {
        val wrong = capture.replace("\"announced\"", "\"blocked\"")
        assertThat(build(notice(wrong)).text).isEqualTo("repli")
    }

    @Test
    fun `an arrivals line caps the names and offers to say hi`() {
        val line = notice(
            """{"kind":"members-arrived","count":14,"windowStartedAt":"t",
               "arrivals":[{"participantId":"a","displayName":"Aïcha"},{"participantId":"b","displayName":"Tom"}]}""",
        )
        val content = build(line)
        assertThat(content.text).isEqualTo("Aïcha, Tom et 12 autres viennent d’arriver — dis-leur salut")
        assertThat(content.isArrivalsNotice).isTrue()
    }

    @Test
    fun `a join notice carries its presentation with the no account badge`() {
        val join = notice(
            """{"kind":"member-joined","participantId":"p1","displayName":"Zoé","isAnonymous":true,"viaShareLink":true}""",
        )
        val content = build(join)
        assertThat(content.joinNotice?.showsNoAccountBadge).isTrue()
        assertThat(content.text).isEqualTo("repli")
    }

    @Test
    fun `a notice shaped metadata on a regular message never becomes a notice`() {
        val content = build(notice(capture, source = null))
        assertThat(content.isSystem).isFalse()
        assertThat(content.text).isEqualTo("repli")
        assertThat(content.joinNotice).isNull()
    }

    @Test
    fun `a join notice carries the participant to open and its entry rules`() {
        val content = build(
            notice(
                """{"kind":"member-joined","participantId":"p7","displayName":"Zoé","username":"zoe",
                   "linkRules":{"canSendMessages":true,"canSendFiles":false,"canSendImages":true}}""",
            ),
        )
        val join = content.joinNotice!!
        assertThat(join.participantId).isEqualTo("p7")
        assertThat(join.opensProfile).isTrue()
        assertThat(join.rules?.canSendFiles).isFalse()
        assertThat(join.handle).isEqualTo("@zoe")
    }

    @Test
    fun `a system message without rich metadata is a plain system line on its stored text`() {
        val content = build(notice("""{"foo":"bar"}""", content = "Le groupe a changé de nom"))
        assertThat(content.isSystem).isTrue()
        assertThat(content.joinNotice).isNull()
        assertThat(content.isArrivalsNotice).isFalse()
        assertThat(content.text).isEqualTo("Le groupe a changé de nom")
    }
}
