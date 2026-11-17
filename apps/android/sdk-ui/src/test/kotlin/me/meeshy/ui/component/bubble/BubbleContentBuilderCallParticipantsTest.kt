package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import org.junit.Test

/** A1.2 — le fil résout la ligne des participants par lecteur, depuis un même message (iOS `participantsLine`). */
class BubbleContentBuilderCallParticipantsTest {

    private class Prefs : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private fun callMessage(participants: String?): ApiMessage {
        val tail = participants?.let { ""","participants":$it""" }.orEmpty()
        return ApiMessage(
            id = "m1", conversationId = "c1", senderId = "p1", content = "Appel", originalLanguage = "fr",
            messageSource = "system",
            metadata = Json.parseToJsonElement(
                """{"kind":"call","callId":"c1","initiatorId":"u_awa","callType":"video","outcome":"completed","durationSeconds":760$tail}""",
            ) as JsonObject,
        )
    }

    private fun build(message: ApiMessage, viewer: String?) = BubbleContentBuilder.build(
        message = message, currentUserId = viewer, preferences = Prefs(), readerLanguage = "fr", readerTimeZoneId = "UTC",
    )

    private val team = """[{"userId":"u_awa","displayName":"Awa"},{"userId":"u_me","displayName":"Charles"},{"userId":"u_karim","displayName":"Karim"}]"""

    @Test
    fun `la carte d'appel porte les autres noms et ma presence`() {
        val roster = build(callMessage(team), viewer = "u_me").callParticipants
        assertThat(roster?.names("vous")).containsExactly("Awa", "Karim", "vous").inOrder()
    }

    @Test
    fun `le meme message se resout autrement chez un autre lecteur`() {
        val roster = build(callMessage(team), viewer = "u_awa").callParticipants
        assertThat(roster?.names("vous")).containsExactly("Charles", "Karim", "vous").inOrder()
    }

    @Test
    fun `sans participants servis la carte n'invente aucune ligne`() {
        assertThat(build(callMessage(null), viewer = "u_me").callParticipants).isNull()
        assertThat(build(callMessage("\"x\""), viewer = "u_me").callParticipants).isNull()
    }
}
