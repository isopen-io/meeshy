package me.meeshy.sdk.model.call

import kotlinx.serialization.json.Json

/**
 * A decoded incoming-call data push — the Android FCM `data` map equivalent of
 * the iOS VoIP (PushKit) payload consumed by `VoIPPushManager`. When the app is
 * backgrounded or killed the socket is down, so the gateway delivers the ring as
 * a data-only push; this is the typed shape a full-screen-intent / Telecom
 * `ConnectionService` slice will render.
 *
 * Field parity with the gateway `CallEventsHandler` push (`data.type == "call"`)
 * and the recovery `PushNotificationService.sendVoIPPush` (`data.type ==
 * "voip_call"`): `callId`, `conversationId`, `callerUserId`, `callerName`,
 * `isVideo` (sent as the string `"true"`/`"false"`), and `iceServers` (a
 * JSON-encoded array the caller MUST configure WebRTC with before answering).
 */
data class IncomingCallPush(
    val callId: String,
    val conversationId: String? = null,
    val callerUserId: String? = null,
    val callerName: String? = null,
    val isVideo: Boolean = false,
    val iceServers: List<SocketIceServer> = emptyList(),
) {
    /**
     * The caller label to show on the ring, blank-skipping like the iOS
     * `localizedCallerName` fallback: the pushed [callerName] when non-blank,
     * else the shared "unknown" placeholder used across the call journal.
     */
    val displayName: String
        get() = callerName?.takeIf { it.isNotBlank() } ?: UNKNOWN_CALLER

    companion object {
        const val UNKNOWN_CALLER = "Inconnu"
    }
}

/**
 * Pure parser for an incoming-call data push. Total and side-effect-free: any
 * map maps to exactly one `IncomingCallPush?` and nothing throws.
 *
 * Mirrors the iOS `VoIPPushManager` payload guard — a push is a call iff its
 * `type` is one of [CALL_TYPES] AND it carries a non-blank `callId`; every other
 * map is inert (`null`), never a phantom. `isVideo` reads the string flag
 * (`"true"` case-insensitively → video, anything else → audio), and `iceServers`
 * decodes the JSON-encoded array leniently, degrading a missing / malformed
 * value to an empty list rather than dropping the whole push.
 */
object IncomingCallPushParser {

    val CALL_TYPES: Set<String> = setOf("call", "voip_call")

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    fun parse(data: Map<String, String>): IncomingCallPush? {
        val type = data["type"]
        if (type !in CALL_TYPES) return null
        val callId = data["callId"]?.takeIf { it.isNotBlank() } ?: return null
        return IncomingCallPush(
            callId = callId,
            conversationId = data["conversationId"]?.takeIf { it.isNotBlank() },
            callerUserId = data["callerUserId"]?.takeIf { it.isNotBlank() },
            callerName = data["callerName"]?.takeIf { it.isNotBlank() },
            isVideo = data["isVideo"].equals("true", ignoreCase = true),
            iceServers = parseIceServers(data["iceServers"]),
        )
    }

    private fun parseIceServers(raw: String?): List<SocketIceServer> {
        val body = raw?.takeIf { it.isNotBlank() } ?: return emptyList()
        return runCatching { json.decodeFromString<List<SocketIceServer>>(body) }
            .getOrElse { emptyList() }
    }
}

/**
 * An immutable, time-bounded ring of recently-seen call ids — the pure port of
 * the iOS `VoIPDedupRing` (a delayed / retried VoIP push can arrive twice, and
 * each delivery must be de-duplicated so only the first rings). Bounded by
 * [capacity] entries and a [ttlMillis] freshness window; every mutation returns
 * a new ring (no in-place state), so a stateful holder in the app layer owns the
 * single live instance.
 */
data class SeenCallRing(
    val entries: List<Entry> = emptyList(),
    val capacity: Int = DEFAULT_CAPACITY,
    val ttlMillis: Long = DEFAULT_TTL_MILLIS,
) {
    data class Entry(val callId: String, val atMillis: Long)

    /** True iff [callId] was inserted within the last [ttlMillis]. */
    fun contains(callId: String, nowMillis: Long): Boolean =
        entries.any { it.callId == callId && !isExpired(it, nowMillis) }

    /**
     * Records [callId] as seen at [nowMillis]: prunes expired entries, refreshes
     * a same-id entry (so re-seeing resets its window), and trims the oldest
     * entries beyond [capacity]. Idempotent on the freshness a duplicate check
     * relies on.
     */
    fun insert(callId: String, nowMillis: Long): SeenCallRing {
        val kept = entries.filterNot { isExpired(it, nowMillis) || it.callId == callId }
        val appended = kept + Entry(callId, nowMillis)
        return copy(entries = appended.takeLast(capacity))
    }

    /** Forgets [callId] (e.g. CallKit refused the report), regardless of age. */
    fun remove(callId: String): SeenCallRing =
        copy(entries = entries.filterNot { it.callId == callId })

    private fun isExpired(entry: Entry, nowMillis: Long): Boolean =
        nowMillis - entry.atMillis >= ttlMillis

    companion object {
        const val DEFAULT_CAPACITY = 24
        const val DEFAULT_TTL_MILLIS = 30_000L
    }
}

/**
 * The outcome of evaluating an incoming-call push against the live call context.
 * Either the push should [Ring] the device, or it is [Ignore]d for a stated
 * [Ignore.Reason] — never both, so the caller pattern-matches every branch.
 */
sealed interface IncomingCallDecision {
    data class Ring(val push: IncomingCallPush) : IncomingCallDecision
    data class Ignore(val reason: Reason) : IncomingCallDecision

    enum class Reason {
        /** Already-seen call id (retried push) or the currently-active call. */
        DUPLICATE,

        /** A different call is already in progress on this device. */
        BUSY,

        /** The push echoes a call this same user initiated (self-fanout). */
        SELF_INITIATED,
    }
}

/**
 * The immutable snapshot an [IncomingCallDecider] evaluates a push against:
 * the [activeCallId] currently on-device (null when idle), the [seen] dedup
 * ring, the [selfUserId] to reject self-fanout, and the decision [nowMillis].
 */
data class IncomingCallContext(
    val nowMillis: Long,
    val activeCallId: String? = null,
    val seen: SeenCallRing = SeenCallRing(),
    val selfUserId: String? = null,
)

/**
 * Pure gate deciding whether an incoming-call push rings the device. Faithful to
 * the iOS `VoIPPushManager` / `CallManager.reportIncomingVoIPCall` ordering:
 *
 * 1. a push whose caller is this same user is self-fanout → [Reason.SELF_INITIATED];
 * 2. a push for the currently-active call, or an already-seen id, is a duplicate
 *    → [Reason.DUPLICATE];
 * 3. a push arriving while a *different* call is active → [Reason.BUSY]
 *    (the app layer surfaces call-waiting rather than a second full-screen ring);
 * 4. otherwise → [Ring].
 *
 * Side-effect-free: recording the id in the [SeenCallRing] is the caller's job on
 * a [Ring] outcome, keeping this a total, deterministic function of its inputs.
 */
object IncomingCallDecider {

    fun decide(push: IncomingCallPush, context: IncomingCallContext): IncomingCallDecision {
        val self = context.selfUserId?.takeIf { it.isNotBlank() }
        if (self != null && push.callerUserId == self) {
            return IncomingCallDecision.Ignore(IncomingCallDecision.Reason.SELF_INITIATED)
        }
        if (push.callId == context.activeCallId) {
            return IncomingCallDecision.Ignore(IncomingCallDecision.Reason.DUPLICATE)
        }
        if (context.seen.contains(push.callId, context.nowMillis)) {
            return IncomingCallDecision.Ignore(IncomingCallDecision.Reason.DUPLICATE)
        }
        if (context.activeCallId != null) {
            return IncomingCallDecision.Ignore(IncomingCallDecision.Reason.BUSY)
        }
        return IncomingCallDecision.Ring(push)
    }
}
