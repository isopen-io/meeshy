package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Behavioural spec for [ActiveCallSession] — the decode of the gateway's
 * `callSessionSchema` payload (`GET /conversations/:id/active-call`, crash
 * recovery `GET /calls/active`), port of iOS `ActiveCallSession`.
 *
 * Wire truths this spec pins (bug 2026-07-12, fixed gateway-side `223e07134`):
 * - `mode` carries the WebRTC ARCHITECTURE (p2p|sfu) — it is never "video";
 * - the call's audio/video nature travels in the whitelisted `metadata.type`;
 * - sessions serialized before the metadata whitelist carry no metadata at
 *   all and must decode as audio, not fail.
 */
class ActiveCallSessionTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `decodes gateway shape - video type from metadata, mode stays p2p`() {
        val payload = """
        {
            "id": "call-1",
            "conversationId": "conv-1",
            "mode": "p2p",
            "status": "active",
            "metadata": { "type": "video" },
            "participants": [
                { "userId": "user-1", "user": { "id": "user-1", "username": "alice", "displayName": "Alice" } },
                { "userId": "user-2", "user": { "id": "user-2", "username": "bob", "displayName": "Bob" } }
            ]
        }
        """.trimIndent()

        val session = json.decodeFromString<ActiveCallSession>(payload)

        assertThat(session.id).isEqualTo("call-1")
        assertThat(session.isVideo).isTrue()
        assertThat(session.remoteParticipant("user-1")?.user?.username).isEqualTo("bob")
    }

    @Test
    fun `audio call is not video`() {
        val payload = """
        {
            "id": "call-2",
            "conversationId": "conv-1",
            "mode": "p2p",
            "status": "active",
            "metadata": { "type": "audio" },
            "participants": []
        }
        """.trimIndent()

        val session = json.decodeFromString<ActiveCallSession>(payload)

        assertThat(session.isVideo).isFalse()
    }

    @Test
    fun `legacy session without metadata decodes and defaults to audio`() {
        val payload = """
        {
            "id": "call-3",
            "conversationId": "conv-1",
            "mode": "p2p",
            "status": "active",
            "participants": []
        }
        """.trimIndent()

        val session = json.decodeFromString<ActiveCallSession>(payload)

        assertThat(session.id).isEqualTo("call-3")
        assertThat(session.isVideo).isFalse()
    }

    @Test
    fun `remoteParticipant is null when only self is present`() {
        val session = ActiveCallSession(
            id = "call-1",
            conversationId = "conv-1",
            mode = "p2p",
            status = "active",
            participants = listOf(ActiveCallParticipant(userId = "user-1")),
        )

        assertThat(session.remoteParticipant("user-1")).isNull()
    }

    @Test
    fun `unknown fields on the wire are ignored`() {
        val payload = """
        {
            "id": "call-4",
            "conversationId": "conv-1",
            "mode": "p2p",
            "status": "active",
            "participantCount": 2,
            "createdAt": "2026-07-12T03:00:00.000Z",
            "participants": []
        }
        """.trimIndent()

        val session = json.decodeFromString<ActiveCallSession>(payload)

        assertThat(session.id).isEqualTo("call-4")
    }
}
