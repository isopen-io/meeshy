package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Behavioural spec for the call journal model — the pure port of iOS
 * `CallModels.swift` + `CallMediaType`. Everything is exercised through the
 * public API (enums' factories, [CallRecord]'s display accessors, and a real
 * gateway-shaped JSON decode). No reflection, no implementation details.
 *
 * Every branch is covered: the direction switch incl. the unknown-degrades arm,
 * the media flag, the four-tier name resolution incl. blank skips, the avatar
 * fallback, the duration formatter across the hour boundary, and the data-label
 * guards + unit ladder.
 */
class CallRecordTest {

    private val json = Json { ignoreUnknownKeys = true }

    private fun record(
        direction: String = "incoming",
        isVideo: Boolean = false,
        conversationTitle: String? = "Team",
        conversationAvatar: String? = null,
        durationSec: Int = 0,
        bytesSent: Int? = null,
        bytesReceived: Int? = null,
        peer: CallHistoryPeer? = null,
    ): CallRecord = CallRecord(
        callId = "c1",
        conversationId = "conv1",
        conversationType = "direct",
        conversationTitle = conversationTitle,
        conversationAvatar = conversationAvatar,
        mode = "p2p",
        status = "ended",
        direction = direction,
        isVideo = isVideo,
        startedAt = "2026-07-01T10:00:00.000Z",
        durationSec = durationSec,
        bytesSent = bytesSent,
        bytesReceived = bytesReceived,
        peer = peer,
    )

    private fun peer(
        username: String = "alice",
        displayName: String? = null,
        avatar: String? = null,
    ): CallHistoryPeer = CallHistoryPeer(
        userId = "u1",
        username = username,
        displayName = displayName,
        avatar = avatar,
    )

    // --- CallDirection.fromRaw ----------------------------------------------

    @Test
    fun `fromRaw maps each known wire value`() {
        assertThat(CallDirection.fromRaw("incoming")).isEqualTo(CallDirection.INCOMING)
        assertThat(CallDirection.fromRaw("outgoing")).isEqualTo(CallDirection.OUTGOING)
        assertThat(CallDirection.fromRaw("missed")).isEqualTo(CallDirection.MISSED)
    }

    @Test
    fun `fromRaw degrades an unknown value to incoming`() {
        assertThat(CallDirection.fromRaw("rejected")).isEqualTo(CallDirection.INCOMING)
        assertThat(CallDirection.fromRaw("")).isEqualTo(CallDirection.INCOMING)
    }

    @Test
    fun `directionKind and isMissed reflect the wire direction`() {
        assertThat(record(direction = "outgoing").directionKind).isEqualTo(CallDirection.OUTGOING)
        assertThat(record(direction = "missed").isMissed).isTrue()
        assertThat(record(direction = "incoming").isMissed).isFalse()
        assertThat(record(direction = "bogus").isMissed).isFalse()
    }

    // --- CallMediaType ------------------------------------------------------

    @Test
    fun `forVideo maps the video flag both ways`() {
        assertThat(CallMediaType.forVideo(true)).isEqualTo(CallMediaType.AUDIO_VIDEO)
        assertThat(CallMediaType.forVideo(false)).isEqualTo(CallMediaType.AUDIO_ONLY)
    }

    @Test
    fun `mediaType derives from the record's isVideo`() {
        assertThat(record(isVideo = true).mediaType).isEqualTo(CallMediaType.AUDIO_VIDEO)
        assertThat(record(isVideo = false).mediaType).isEqualTo(CallMediaType.AUDIO_ONLY)
    }

    // --- displayName resolution ---------------------------------------------

    @Test
    fun `displayName prefers a non-blank peer display name`() {
        val r = record(peer = peer(username = "alice", displayName = "Alice Wonderland"))
        assertThat(r.displayName).isEqualTo("Alice Wonderland")
    }

    @Test
    fun `displayName falls back to peer username when display name is blank`() {
        val r = record(peer = peer(username = "alice", displayName = "   "))
        assertThat(r.displayName).isEqualTo("alice")
    }

    @Test
    fun `displayName falls back to conversation title when no peer`() {
        val r = record(conversationTitle = "Design Guild", peer = null)
        assertThat(r.displayName).isEqualTo("Design Guild")
    }

    @Test
    fun `displayName falls back to conversation title when peer names are blank`() {
        val r = record(conversationTitle = "Design Guild", peer = peer(username = "", displayName = null))
        assertThat(r.displayName).isEqualTo("Design Guild")
    }

    @Test
    fun `displayName uses the fallback when nothing is usable`() {
        val r = record(conversationTitle = "  ", peer = peer(username = "", displayName = ""))
        assertThat(r.displayName).isEqualTo("Inconnu")
    }

    // --- avatarUrl fallback -------------------------------------------------

    @Test
    fun `avatarUrl prefers the peer avatar`() {
        val r = record(
            conversationAvatar = "conv.png",
            peer = peer(avatar = "peer.png"),
        )
        assertThat(r.avatarUrl).isEqualTo("peer.png")
    }

    @Test
    fun `avatarUrl falls back to the conversation avatar`() {
        assertThat(record(conversationAvatar = "conv.png", peer = null).avatarUrl).isEqualTo("conv.png")
        assertThat(record(conversationAvatar = "conv.png", peer = peer(avatar = null)).avatarUrl)
            .isEqualTo("conv.png")
    }

    @Test
    fun `avatarUrl is null when neither side has one`() {
        assertThat(record(conversationAvatar = null, peer = null).avatarUrl).isNull()
    }

    // --- durationLabel ------------------------------------------------------

    @Test
    fun `durationLabel is empty for a zero or negative duration`() {
        assertThat(record(durationSec = 0).durationLabel).isEqualTo("")
        assertThat(record(durationSec = -5).durationLabel).isEqualTo("")
    }

    @Test
    fun `durationLabel formats sub-minute and minute durations as M SS`() {
        assertThat(record(durationSec = 5).durationLabel).isEqualTo("0:05")
        assertThat(record(durationSec = 65).durationLabel).isEqualTo("1:05")
        assertThat(record(durationSec = 600).durationLabel).isEqualTo("10:00")
    }

    @Test
    fun `durationLabel formats hour-plus durations as H MM SS`() {
        assertThat(record(durationSec = 3600).durationLabel).isEqualTo("1:00:00")
        assertThat(record(durationSec = 3661).durationLabel).isEqualTo("1:01:01")
        assertThat(record(durationSec = 3725).durationLabel).isEqualTo("1:02:05")
    }

    // --- dataLabel ----------------------------------------------------------

    @Test
    fun `dataLabel is null when no byte counters were recorded`() {
        assertThat(record(bytesSent = null, bytesReceived = null).dataLabel).isNull()
    }

    @Test
    fun `dataLabel is null when the counters sum to zero`() {
        assertThat(record(bytesSent = 0, bytesReceived = 0).dataLabel).isNull()
    }

    @Test
    fun `dataLabel counts a single present counter`() {
        assertThat(record(bytesSent = 500, bytesReceived = null).dataLabel).isEqualTo("500 B")
        assertThat(record(bytesSent = null, bytesReceived = 700).dataLabel).isEqualTo("700 B")
    }

    @Test
    fun `dataLabel sums both counters and climbs the unit ladder`() {
        assertThat(record(bytesSent = 512, bytesReceived = 512).dataLabel).isEqualTo("1.0 KB")
        assertThat(record(bytesSent = 1536, bytesReceived = 0).dataLabel).isEqualTo("1.5 KB")
        assertThat(record(bytesSent = 1024 * 1024, bytesReceived = 0).dataLabel).isEqualTo("1.0 MB")
        assertThat(record(bytesSent = 1024 * 1024 * 1024, bytesReceived = 0).dataLabel).isEqualTo("1.0 GB")
    }

    // --- serialization (gateway CallHistoryItem shape) ----------------------

    @Test
    fun `decodes a gateway call-history payload with a peer`() {
        val payload = """
            {
              "callId": "call_1",
              "conversationId": "conv_1",
              "conversationType": "direct",
              "conversationTitle": "Alice",
              "conversationAvatar": null,
              "mode": "p2p",
              "status": "ended",
              "endReason": "completed",
              "direction": "outgoing",
              "isVideo": true,
              "startedAt": "2026-07-01T10:00:00.000Z",
              "answeredAt": "2026-07-01T10:00:03.000Z",
              "endedAt": "2026-07-01T10:05:03.000Z",
              "durationSec": 300,
              "bytesSent": 1048576,
              "bytesReceived": 524288,
              "peer": {
                "userId": "u_alice",
                "username": "alice",
                "displayName": "Alice W.",
                "avatar": "alice.png",
                "phoneNumber": null,
                "isOnline": true
              },
              "serverOnlyExtra": "ignored"
            }
        """.trimIndent()

        val decoded = json.decodeFromString(CallRecord.serializer(), payload)

        assertThat(decoded.callId).isEqualTo("call_1")
        assertThat(decoded.directionKind).isEqualTo(CallDirection.OUTGOING)
        assertThat(decoded.mediaType).isEqualTo(CallMediaType.AUDIO_VIDEO)
        assertThat(decoded.durationLabel).isEqualTo("5:00")
        assertThat(decoded.dataLabel).isEqualTo("1.5 MB")
        assertThat(decoded.displayName).isEqualTo("Alice W.")
        assertThat(decoded.avatarUrl).isEqualTo("alice.png")
        assertThat(decoded.peer?.isOnline).isTrue()
    }

    @Test
    fun `decodes a group call-history payload without a peer`() {
        val payload = """
            {
              "callId": "call_2",
              "conversationId": "conv_2",
              "conversationType": "group",
              "conversationTitle": "Design Guild",
              "conversationAvatar": "guild.png",
              "mode": "sfu",
              "status": "missed",
              "direction": "missed",
              "isVideo": false,
              "startedAt": "2026-07-01T09:00:00.000Z",
              "durationSec": 0
            }
        """.trimIndent()

        val decoded = json.decodeFromString(CallRecord.serializer(), payload)

        assertThat(decoded.peer).isNull()
        assertThat(decoded.isMissed).isTrue()
        assertThat(decoded.displayName).isEqualTo("Design Guild")
        assertThat(decoded.avatarUrl).isEqualTo("guild.png")
        assertThat(decoded.durationLabel).isEqualTo("")
        assertThat(decoded.dataLabel).isNull()
    }
}
