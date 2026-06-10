package me.meeshy.sdk.conversation

import me.meeshy.sdk.model.ApiMessage

/** Delivery progress of a message row as known locally (ARCHITECTURE.md §5). */
public enum class LocalSendState {
    /** Server-acked — the row came from (or was confirmed by) the gateway. */
    SYNCED,

    /** Optimistic local row, queued or in flight in the outbox. */
    SENDING,

    /** The outbox gave up — the user can retry. */
    FAILED,
}

/**
 * A message plus its local delivery state. UI layers render [message] exactly
 * like a server message; [sendState] only drives the status indicator.
 */
public data class LocalMessage(
    val message: ApiMessage,
    val sendState: LocalSendState = LocalSendState.SYNCED,
)
