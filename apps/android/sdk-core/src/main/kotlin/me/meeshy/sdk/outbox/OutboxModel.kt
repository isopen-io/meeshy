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
    UPDATE_PROFILE,
    UPDATE_SETTINGS,
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
    public const val PRESENCE: String = "presence"
    public const val SOCIAL: String = "social"
    public const val PROFILE: String = "profile"
    public const val SETTINGS: String = "settings"
}
