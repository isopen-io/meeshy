package me.meeshy.sdk.model

/**
 * The send-side lifecycle glyph shown on the SENDER's own outgoing message before
 * (and around) the server acknowledgement. Distinct from [DeliveryTier], which
 * covers the received/read promotion once a message has reached the server.
 */
enum class SendLifecycle {
    /** A hard send failure — the message never reached the server. */
    Failed,

    /** Still pending with no connection: parked in the outbox until reconnect (hourglass). */
    QueuedOffline,

    /** Still pending with a live connection: the send is in flight (clock). */
    InFlight,

    /** Past the ack — the delivered/read tier is resolved by [DeliveryStatusResolver]. */
    Settled,
}

/**
 * Resolves the [SendLifecycle] of an outgoing message from its send state and the
 * device's connectivity — port of the iOS `BubbleDeliveryBadge` rule that shows an
 * **offline hourglass** for a `.sending` message while `!NetworkMonitor.isOnline`
 * and a live **clock** otherwise.
 *
 * Precedence, highest first:
 * 1. a failure wins over everything (it is a terminal send outcome);
 * 2. a still-pending message is [QueuedOffline] when the device is offline (the
 *    message sits in the outbox), else [InFlight];
 * 3. otherwise the message is [Settled] — connectivity is irrelevant once it has
 *    reached the server, so a delivered/read message never regresses to the
 *    outbox hourglass just because the link later dropped.
 *
 * Stateless and pure.
 */
object SendLifecycleResolver {

    fun resolve(isPending: Boolean, isFailed: Boolean, isOffline: Boolean): SendLifecycle =
        when {
            isFailed -> SendLifecycle.Failed
            isPending && isOffline -> SendLifecycle.QueuedOffline
            isPending -> SendLifecycle.InFlight
            else -> SendLifecycle.Settled
        }
}
