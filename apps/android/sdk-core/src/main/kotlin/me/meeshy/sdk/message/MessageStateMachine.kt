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
