package me.meeshy.sdk.message

/**
 * Delivery lifecycle of an outbound message (ARCHITECTURE.md §6).
 *
 * The progress path `QUEUED → SENDING → SENT → DELIVERED → READ` is monotonic —
 * an out-of-order or duplicate receipt never regresses it. Failure states sit
 * beside the path; a receipt proves the message arrived and overrides them.
 */
public enum class MessageDeliveryState {
    QUEUED,
    SENDING,
    SENT,
    DELIVERED,
    READ,
    FAILED,
    RETRYING,
    EXHAUSTED,
    ;

    /** The name written in the row; stable on disk, so a variant is only ever appended. */
    public val persistedName: String get() = name

    public companion object {
        /** Tolerant: an unknown or absent name is `null`, never a crash (an older row, a newer build). */
        public fun fromPersisted(name: String?): MessageDeliveryState? =
            name?.let { stored -> entries.firstOrNull { it.name == stored } }
    }
}

/** An event that may advance a message's [MessageDeliveryState]. */
public sealed interface MessageEvent {
    public data object SendStarted : MessageEvent
    public data object GatewayAck : MessageEvent
    public data object DeliveryReceipt : MessageEvent
    public data object ReadReceipt : MessageEvent
    public data object SendFailed : MessageEvent
    public data object RetryScheduled : MessageEvent
    public data object Exhausted : MessageEvent
}

/**
 * Pure, total transition function for [MessageDeliveryState]. Every
 * (state, event) pair yields a state; invalid or regressive events are ignored
 * (the current state is returned), which makes socket replays idempotent.
 */
public object MessageStateMachine {

    private val progress: List<MessageDeliveryState> = listOf(
        MessageDeliveryState.QUEUED,
        MessageDeliveryState.SENDING,
        MessageDeliveryState.SENT,
        MessageDeliveryState.DELIVERED,
        MessageDeliveryState.READ,
    )

    private val restartable: Set<MessageDeliveryState> = setOf(
        MessageDeliveryState.QUEUED,
        MessageDeliveryState.FAILED,
        MessageDeliveryState.RETRYING,
    )

    private val failable: Set<MessageDeliveryState> = setOf(
        MessageDeliveryState.QUEUED,
        MessageDeliveryState.SENDING,
        MessageDeliveryState.RETRYING,
    )

    private val exhaustible: Set<MessageDeliveryState> = setOf(
        MessageDeliveryState.SENDING,
        MessageDeliveryState.FAILED,
        MessageDeliveryState.RETRYING,
    )

    public fun transition(
        current: MessageDeliveryState,
        event: MessageEvent,
    ): MessageDeliveryState = when (event) {
        MessageEvent.SendStarted ->
            if (current in restartable) MessageDeliveryState.SENDING else current
        MessageEvent.SendFailed ->
            if (current in failable) MessageDeliveryState.FAILED else current
        MessageEvent.RetryScheduled ->
            if (current == MessageDeliveryState.FAILED) MessageDeliveryState.RETRYING else current
        MessageEvent.Exhausted ->
            if (current in exhaustible) MessageDeliveryState.EXHAUSTED else current
        MessageEvent.GatewayAck -> advanceTo(current, MessageDeliveryState.SENT)
        MessageEvent.DeliveryReceipt -> advanceTo(current, MessageDeliveryState.DELIVERED)
        MessageEvent.ReadReceipt -> advanceTo(current, MessageDeliveryState.READ)
    }

    /**
     * The transition [event] causes, or `null` when it is refused (a regression, a replayed receipt, an invalid move).
     * A socket receipt goes through here: `null` means "write nothing", which keeps a replay idempotent.
     */
    public fun applyEvent(current: MessageDeliveryState, event: MessageEvent): MessageDeliveryState? =
        transition(current, event).takeIf { it != current }

    /**
     * The state a stored row stands in: the local send column first (`SENDING` / `FAILED` / `EXHAUSTED`, a retry already
     * charged reads as `RETRYING`), then the receipt counters for a server-acked row. Read-only and monotone.
     */
    public fun derive(
        sendState: String?,
        deliveredCount: Int,
        readCount: Int,
        retryCount: Int,
    ): MessageDeliveryState {
        val local = MessageDeliveryState.fromPersisted(sendState)
        val fromReceipts = when {
            readCount > 0 -> MessageDeliveryState.READ
            deliveredCount > 0 -> MessageDeliveryState.DELIVERED
            else -> MessageDeliveryState.SENT
        }
        return when {
            local == MessageDeliveryState.SENDING && retryCount > 0 -> MessageDeliveryState.RETRYING
            local == null -> fromReceipts
            local in progress && local.ordinal > MessageDeliveryState.SENDING.ordinal ->
                if (progress.indexOf(fromReceipts) >= progress.indexOf(local)) fromReceipts else local
            else -> local
        }
    }

    private fun advanceTo(
        current: MessageDeliveryState,
        target: MessageDeliveryState,
    ): MessageDeliveryState {
        val currentRank = progress.indexOf(current)
        // A receipt proves the message arrived: from a failure state, jump onto
        // the progress path; on the path, never regress.
        if (currentRank == -1) return target
        return if (currentRank >= progress.indexOf(target)) current else target
    }
}

/**
 * Correspondence with the iOS vocabulary (`MessageEvent` in `MessageStateMachine.swift`), so a replayed receipt maps to the
 * same event on both platforms and stays idempotent. iOS `draft` is the state before [MessageDeliveryState.QUEUED];
 * `enqueue` has no Android event (the outbox row is the enqueue); `delivered(count)` is [MessageEvent.DeliveryReceipt]
 * only while `count > 0` (the caller checks it); `readBy` is [MessageEvent.ReadReceipt]; `retryExhausted` is
 * [MessageEvent.Exhausted]; iOS `failed` is Android FAILED (retry left) or EXHAUSTED (spent).
 */
public object IosMessageEvents {
    private val table: Map<String, MessageEvent> = mapOf(
        "startSending" to MessageEvent.SendStarted,
        "serverAck" to MessageEvent.GatewayAck,
        "delivered" to MessageEvent.DeliveryReceipt,
        "readBy" to MessageEvent.ReadReceipt,
        "sendFailed" to MessageEvent.SendFailed,
        "retry" to MessageEvent.RetryScheduled,
        "retryExhausted" to MessageEvent.Exhausted,
    )

    public fun event(iosName: String): MessageEvent? = table[iosName]
}
