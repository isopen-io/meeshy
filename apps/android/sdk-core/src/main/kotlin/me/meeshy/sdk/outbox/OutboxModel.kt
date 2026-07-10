package me.meeshy.sdk.outbox

import me.meeshy.core.database.entity.OutboxEntity

/** Mutation kinds the outbox can carry (ARCHITECTURE.md §5). */
public enum class OutboxKind {
    SEND_MESSAGE,
    EDIT_MESSAGE,
    DELETE_MESSAGE,
    ADD_REACTION,
    REMOVE_REACTION,
    READ_RECEIPT,
    UPDATE_CONVERSATION_PREFS,
    UPDATE_PROFILE,
    UPDATE_SETTINGS,
    PUBLISH_STORY,
}

/** Lifecycle of an outbox row; a succeeded mutation is deleted, never flagged. */
public enum class OutboxState {
    PENDING,
    INFLIGHT,
    EXHAUSTED,
}

/** Drain lane for a mutation — see [OutboxLanes]. */
public val OutboxEntity.kindEnum: OutboxKind
    get() = OutboxKind.valueOf(kind)

public val OutboxEntity.stateEnum: OutboxState
    get() = OutboxState.valueOf(state)

/**
 * Lane assignment (ARCHITECTURE.md §5): messages are strict FIFO per
 * conversation; everything else drains on its own independent lane so a stuck
 * row never head-of-line blocks unrelated mutations.
 */
public object OutboxLanes {
    public fun forMessage(conversationId: String): String = "message:$conversationId"
    public const val REACTION: String = "reaction"
    public const val READ_RECEIPT: String = "readReceipt"
    public const val CONVERSATION_PREFS: String = "conversationPrefs"
    public const val PRESENCE: String = "presence"
    public const val SOCIAL: String = "social"
    public const val STORY: String = "story"
    public const val PROFILE: String = "profile"
    public const val SETTINGS: String = "settings"
}

/** Payload of an `ADD_REACTION` / `REMOVE_REACTION` outbox row. */
@kotlinx.serialization.Serializable
public data class ReactionPayload(val emoji: String)

/**
 * Payload of an `UPDATE_CONVERSATION_PREFS` outbox row — the full desired
 * per-user preference snapshot at enqueue time. Carrying the complete snapshot
 * (computed from the already-mutated cache) makes coalescing a plain
 * latest-wins replace: a later pin+mute snapshot subsumes an earlier pin-only
 * one without losing either field.
 */
@kotlinx.serialization.Serializable
public data class ConversationPrefsPayload(
    val isPinned: Boolean,
    val isMuted: Boolean,
    val isArchived: Boolean,
    val mentionsOnly: Boolean,
)

/** Input to [OutboxRepository.enqueue] — a mutation to deliver. */
public data class OutboxMutation(
    val kind: OutboxKind,
    val lane: String,
    val targetId: String,
    val payload: String,
    val dependsOn: String? = null,
    val cmid: String = OutboxIds.cmid(),
)

internal fun OutboxMutation.toEntity(now: Long): OutboxEntity = OutboxEntity(
    cmid = cmid,
    lane = lane,
    kind = kind.name,
    targetId = targetId,
    payload = payload,
    dependsOn = dependsOn,
    attempts = 0,
    state = OutboxState.PENDING.name,
    createdAt = now,
    updatedAt = now,
)

/** Terminal (or near-terminal) signal for a queued mutation, keyed by [cmid]. */
public sealed interface OutboxOutcome {
    public val cmid: String

    /** Delivered and acknowledged by the gateway. */
    public data class Succeeded(override val cmid: String) : OutboxOutcome

    /** Gave up after the maximum number of attempts — surfaced to the user. */
    public data class Exhausted(override val cmid: String, val reason: String) : OutboxOutcome

    /** Replaced by a newer mutation of the same target (coalesced). */
    public data class Superseded(override val cmid: String) : OutboxOutcome

    /** Annihilated before delivery (e.g. send + delete, reaction toggle). */
    public data class Cancelled(override val cmid: String) : OutboxOutcome
}
