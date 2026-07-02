package me.meeshy.sdk.model.call

import kotlinx.serialization.Serializable

/**
 * The call journal — a pure, dependency-free port of iOS `CallModels.swift`
 * ([CallDirection], [CallHistoryPeer], `APICallRecord`) plus the [CallMediaType]
 * enum from iOS `WebRTCTypes.swift`.
 *
 * [CallRecord] mirrors the gateway REST contract `CallHistoryItem`
 * (`services/gateway/src/services/callHistory.ts`, `GET /api/v1/calls/history`)
 * field-for-field so a payload decodes 1:1. Timestamps stay as ISO-8601
 * [String]s — faithful to the wire and keeping `:core:model` free of any date
 * dependency (a repository layer parses them where a real [java.time] type is
 * needed).
 *
 * Every display decision (name resolution, duration/data labels, direction
 * classification) is a **pure accessor** here — the single tested source of
 * truth a future call-history list renders, never re-derived at a call site.
 */

/**
 * From the current user's vantage point. The gateway derives and sends this; the
 * client trusts it. [fromRaw] degrades an unknown value to [INCOMING] rather than
 * failing the whole record — parity with iOS `CallDirection(raw:)`.
 */
enum class CallDirection(val wire: String) {
    INCOMING("incoming"),
    OUTGOING("outgoing"),
    MISSED("missed");

    companion object {
        fun fromRaw(raw: String): CallDirection =
            entries.firstOrNull { it.wire == raw } ?: INCOMING
    }
}

/**
 * The media the call carried. Port of iOS `CallMediaType` (`WebRTCTypes.swift`).
 * The history record persists this as an `isVideo` bool; [forVideo] is the single
 * mapping from that flag to the enum.
 */
enum class CallMediaType {
    AUDIO_ONLY,
    AUDIO_VIDEO;

    companion object {
        fun forVideo(isVideo: Boolean): CallMediaType =
            if (isVideo) AUDIO_VIDEO else AUDIO_ONLY
    }
}

/**
 * The other party of a P2P/direct call. `null` for group calls (the
 * conversation title/avatar identifies those). Mirrors the gateway
 * `CallHistoryPeer` shape.
 */
@Serializable
data class CallHistoryPeer(
    val userId: String,
    val username: String,
    val displayName: String? = null,
    val avatar: String? = null,
    val phoneNumber: String? = null,
    val isOnline: Boolean = false,
)

/**
 * One entry in the call journal. Mirrors the gateway `CallHistoryItem` REST
 * contract; only [callId]/[conversationId] and the other non-null fields are
 * required, so a malformed frame fails to decode rather than half-populating.
 */
@Serializable
data class CallRecord(
    val callId: String,
    val conversationId: String,
    val conversationType: String,
    val conversationTitle: String? = null,
    val conversationAvatar: String? = null,
    /** Architecture mode (`"p2p"`/`"sfu"`), NOT the media type. */
    val mode: String,
    val status: String,
    val endReason: String? = null,
    /** Wire value; read the classified form via [directionKind]. */
    val direction: String,
    val isVideo: Boolean,
    /** ISO-8601 instant strings, as sent by the gateway. */
    val startedAt: String,
    val answeredAt: String? = null,
    val endedAt: String? = null,
    val durationSec: Int,
    val bytesSent: Int? = null,
    val bytesReceived: Int? = null,
    val peer: CallHistoryPeer? = null,
) {
    /** The classified direction, degrading an unknown wire value to incoming. */
    val directionKind: CallDirection get() = CallDirection.fromRaw(direction)

    val isMissed: Boolean get() = directionKind == CallDirection.MISSED

    /** Audio-only vs audio+video, derived from [isVideo]. */
    val mediaType: CallMediaType get() = CallMediaType.forVideo(isVideo)

    /**
     * Best display name: peer display name → peer username → conversation title
     * (group) → fallback. Blank candidates are skipped (surpasses iOS, which
     * only skips empty strings and would surface a whitespace-only name).
     */
    val displayName: String
        get() {
            peer?.displayName?.let { if (it.isNotBlank()) return it }
            peer?.username?.let { if (it.isNotBlank()) return it }
            conversationTitle?.let { if (it.isNotBlank()) return it }
            return FALLBACK_NAME
        }

    /** Peer avatar for a direct call; else the conversation (group) avatar. */
    val avatarUrl: String? get() = peer?.avatar ?: conversationAvatar

    /** `"M:SS"` (or `"H:MM:SS"` past an hour). Empty for a zero-duration call. */
    val durationLabel: String
        get() = if (durationSec <= 0) "" else CallDuration.clock(durationSec.toLong())

    /**
     * Total data transferred, human-readable (e.g. `"1.2 MB"`); `null` when no
     * byte counters were recorded or the total is zero. Deterministic and
     * locale-independent (unlike iOS's locale-formatted `ByteCountFormatter`).
     */
    val dataLabel: String?
        get() {
            if (bytesSent == null && bytesReceived == null) return null
            val total = (bytesSent ?: 0) + (bytesReceived ?: 0)
            if (total <= 0) return null
            return formatBytes(total)
        }
}

private const val FALLBACK_NAME = "Inconnu"
private val BYTE_UNITS = listOf("KB", "MB", "GB", "TB")

private fun formatBytes(total: Int): String {
    if (total < 1024) return "$total B"
    var value = total.toDouble() / 1024.0
    var unitIndex = 0
    while (value >= 1024.0 && unitIndex < BYTE_UNITS.lastIndex) {
        value /= 1024.0
        unitIndex += 1
    }
    return "${oneDecimal(value)} ${BYTE_UNITS[unitIndex]}"
}

/** Round to one decimal without `String.format` (locale-independent). */
private fun oneDecimal(value: Double): String {
    val tenths = Math.round(value * 10.0)
    return "${tenths / 10}.${tenths % 10}"
}
