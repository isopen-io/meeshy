package me.meeshy.sdk.model.export

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * [DataExportData] decodes the gateway `GET /me/export` envelope (routes/me/export.ts). Only the
 * requested sections are present, timestamps stay as raw ISO strings, and unknown keys are ignored
 * — mirroring the SDK's lenient [me.meeshy.sdk.net.MeeshyApi] Json.
 */
class DataExportDataDecodeTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    @Test
    fun `decodes a full profile-messages-contacts payload`() {
        val raw = """
            {
              "exportDate": "2026-07-11T12:00:00.000Z",
              "format": "json",
              "requestedTypes": ["profile","messages","contacts"],
              "profile": { "id": "u1", "username": "alice", "email": "a@b.co", "systemLanguage": "fr" },
              "messages": [ { "id": "m1", "conversationId": "c1", "content": "salut" } ],
              "messagesCount": 1,
              "contacts": [ {
                 "conversationId": "c1", "conversationName": "Team", "conversationType": "group",
                 "participants": [ { "displayName": "Bob", "type": "user" } ]
              } ],
              "contactsCount": 1,
              "serverOnlyKey": "ignored"
            }
        """.trimIndent()

        val data = json.decodeFromString<DataExportData>(raw)

        assertThat(data.exportDate).isEqualTo("2026-07-11T12:00:00.000Z")
        assertThat(data.requestedTypes).containsExactly("profile", "messages", "contacts").inOrder()
        assertThat(data.profile?.username).isEqualTo("alice")
        assertThat(data.messages).hasSize(1)
        assertThat(data.messagesCount).isEqualTo(1)
        assertThat(data.contacts?.first()?.participants?.first()?.displayName).isEqualTo("Bob")
        assertThat(data.contactsCount).isEqualTo(1)
    }

    @Test
    fun `decodes a profile-only payload leaving other sections null`() {
        val raw = """
            {
              "exportDate": "2026-07-11T12:00:00.000Z",
              "format": "json",
              "requestedTypes": ["profile"],
              "profile": { "id": "u1", "username": "alice" }
            }
        """.trimIndent()

        val data = json.decodeFromString<DataExportData>(raw)

        assertThat(data.messages).isNull()
        assertThat(data.contacts).isNull()
        assertThat(data.csv).isNull()
    }

    @Test
    fun `decodes a csv payload carrying per-section csv strings`() {
        val raw = """
            {
              "exportDate": "2026-07-11T12:00:00.000Z",
              "format": "csv",
              "requestedTypes": ["profile"],
              "csv": { "profile": "id,username\nu1,alice" }
            }
        """.trimIndent()

        val data = json.decodeFromString<DataExportData>(raw)

        assertThat(data.format).isEqualTo("csv")
        assertThat(data.csv).containsEntry("profile", "id,username\nu1,alice")
    }
}
