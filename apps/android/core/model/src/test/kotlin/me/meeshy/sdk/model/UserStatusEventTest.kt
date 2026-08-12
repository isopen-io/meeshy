package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Locks the wire contract of `user:status` and `presence:snapshot` against the
 * gateway's REAL payload shape (`packages/shared/types/socketio-events.ts`
 * `UserStatusEvent`/`PresenceSnapshotEventData`: `{userId, username, isOnline,
 * lastActiveAt}` / `{users: [...]}`). A prior `status`/`lastSeenAt`/flat
 * `onlineUserIds` shape here matched none of the gateway's actual field names,
 * so every live presence frame silently decoded to blank defaults — this test
 * pins the correct mapping against a captured-shape payload.
 */
class UserStatusEventTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    @Test
    fun `decodes a real user status broadcast`() {
        val raw = """
            {
              "userId": "u1",
              "username": "atabeth",
              "isOnline": true,
              "lastActiveAt": "2026-08-11T20:00:00.000Z"
            }
        """.trimIndent()

        val event = json.decodeFromString<UserStatusEvent>(raw)

        assertThat(event.userId).isEqualTo("u1")
        assertThat(event.username).isEqualTo("atabeth")
        assertThat(event.isOnline).isTrue()
        assertThat(event.lastActiveAt).isEqualTo("2026-08-11T20:00:00.000Z")
    }

    @Test
    fun `a going-offline frame decodes isOnline false with a null lastActiveAt when privacy hides it`() {
        val event = json.decodeFromString<UserStatusEvent>(
            """{ "userId": "u1", "username": "atabeth", "isOnline": false }""",
        )

        assertThat(event.isOnline).isFalse()
        assertThat(event.lastActiveAt).isNull()
    }

    @Test
    fun `decodes a presence snapshot's nested user list`() {
        val raw = """
            {
              "users": [
                { "userId": "u1", "username": "atabeth", "isOnline": true, "lastActiveAt": null },
                { "userId": "u2", "username": "belva", "isOnline": false, "lastActiveAt": "2026-08-11T19:00:00.000Z" }
              ]
            }
        """.trimIndent()

        val snapshot = json.decodeFromString<PresenceSnapshotEvent>(raw)

        assertThat(snapshot.users).hasSize(2)
        assertThat(snapshot.users[0].userId).isEqualTo("u1")
        assertThat(snapshot.users[0].isOnline).isTrue()
        assertThat(snapshot.users[1].userId).isEqualTo("u2")
        assertThat(snapshot.users[1].lastActiveAt).isEqualTo("2026-08-11T19:00:00.000Z")
    }

    @Test
    fun `an empty snapshot decodes to an empty user list rather than throwing`() {
        val snapshot = json.decodeFromString<PresenceSnapshotEvent>("""{ "users": [] }""")

        assertThat(snapshot.users).isEmpty()
    }
}
