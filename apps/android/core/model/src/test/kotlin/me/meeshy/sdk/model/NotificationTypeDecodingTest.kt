package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class NotificationTypeDecodingTest {

    private val json = Json { ignoreUnknownKeys = true }

    private val newTypes = listOf(
        "contact_joined" to MeeshyNotificationType.CONTACT_JOINED,
        "contact_recently_active" to MeeshyNotificationType.CONTACT_RECENTLY_ACTIVE,
        "level_up" to MeeshyNotificationType.LEVEL_UP,
        "report_resolved" to MeeshyNotificationType.REPORT_RESOLVED,
        "content_removed" to MeeshyNotificationType.CONTENT_REMOVED,
        "game_duo_invited" to MeeshyNotificationType.GAME_DUO_INVITED,
        "game_duo_accepted" to MeeshyNotificationType.GAME_DUO_ACCEPTED,
        "game_league_result" to MeeshyNotificationType.GAME_LEAGUE_RESULT,
        "game_season_step" to MeeshyNotificationType.GAME_SEASON_STEP,
        "game_mission_window" to MeeshyNotificationType.GAME_MISSION_WINDOW,
    )

    @Test
    fun `les dix nouveaux types sont reconnus par leur valeur de fil`() {
        newTypes.forEach { (wire, expected) ->
            assertThat(MeeshyNotificationType.fromWire(wire)).isEqualTo(expected)
            assertThat(json.decodeFromString<MeeshyNotificationType>("\"$wire\"")).isEqualTo(expected)
            assertThat(ApiNotification(id = "n", type = wire).notificationType).isEqualTo(expected)
        }
    }

    @Test
    fun `le type d'appel chinois call est reconnu`() {
        assertThat(MeeshyNotificationType.fromWire("call")).isEqualTo(MeeshyNotificationType.INCOMING_CALL_ALERT)
    }

    @Test
    fun `un type inconnu se decode comme system sans faire echouer la liste`() {
        val raw = """{"success":true,"data":[
            {"id":"a","type":"type_du_futur"},
            {"id":"b","type":"game_duo_invited"}
        ]}"""
        val list = json.decodeFromString<NotificationListResponse>(raw)

        assertThat(list.data).hasSize(2)
        assertThat(list.data[0].notificationType).isEqualTo(MeeshyNotificationType.SYSTEM)
        assertThat(list.data[1].notificationType).isEqualTo(MeeshyNotificationType.GAME_DUO_INVITED)
        assertThat(MeeshyNotificationType.fromWire("")).isNull()
    }

    @Test
    fun `chaque valeur de l'enumeration est un type connu du vocabulaire et inversement`() {
        val wires = MeeshyNotificationType.entries.map { it.wire }.toSet()
        assertThat(wires).isEqualTo(NotificationTypeVocabulary.KNOWN_TYPES)
        assertThat(wires).hasSize(MeeshyNotificationType.entries.size)
    }

    @Test
    fun `la pagination expose nextCursor et reste lisible sans lui`() {
        val withCursor = json.decodeFromString<NotificationListResponse>(
            """{"success":true,"data":[],"pagination":{"limit":30,"hasMore":true,"nextCursor":"2026-01-01_abc"}}""",
        )
        assertThat(withCursor.pagination?.nextCursor).isEqualTo("2026-01-01_abc")
        assertThat(withCursor.pagination?.hasMore).isTrue()

        val legacy = json.decodeFromString<NotificationListResponse>(
            """{"success":true,"data":[],"pagination":{"total":9,"offset":0,"limit":30,"hasMore":false}}""",
        )
        assertThat(legacy.pagination?.nextCursor).isNull()
        assertThat(legacy.pagination?.total).isEqualTo(9)
    }

    @Test
    fun `NotificationData derive callId du contexte d'appel`() {
        val n = ApiNotification(
            id = "n",
            type = "incoming_call",
            context = NotificationContext(
                conversationId = "c1", messageId = "m1", postId = "p1",
                callSessionId = "call-9", friendRequestId = "fr1",
            ),
            metadata = NotificationMetadata(messagePreview = "salut"),
        )

        assertThat(n.data).isEqualTo(
            NotificationData(
                conversationId = "c1", messageId = "m1", postId = "p1",
                callId = "call-9", friendRequestId = "fr1", preview = "salut",
            ),
        )
        assertThat(ApiNotification(id = "x").data).isNull()
    }

    @Test
    fun `le nom affiche de l'acteur prefere displayName puis username`() {
        assertThat(NotificationActor(id = "a", username = "jo", displayName = "Joe").displayedName).isEqualTo("Joe")
        assertThat(NotificationActor(id = "a", username = "jo").displayedName).isEqualTo("jo")
        assertThat(ApiNotification(id = "n", actor = NotificationActor(id = "a", username = "jo")).senderName)
            .isEqualTo("jo")
    }
}
