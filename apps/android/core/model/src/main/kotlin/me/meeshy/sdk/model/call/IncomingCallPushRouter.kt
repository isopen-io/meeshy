package me.meeshy.sdk.model.call

/**
 * The typed instruction the FCM glue acts on for one incoming data push. Exactly
 * one of three outcomes, so the service pattern-matches every branch:
 *
 * - [NotACallPush] — the map is not a call push; hand it to the normal
 *   message-notification path.
 * - [Ring] — surface a full-screen incoming-call notification for [push]; the
 *   caller MUST persist [updatedSeen] as the new live dedup ring so a retried
 *   delivery of the same call is subsequently suppressed.
 * - [Suppress] — a call push that must not ring, for the stated [reason]; the
 *   dedup ring is left untouched (only a ring outcome records the id).
 */
sealed interface IncomingCallPushRoute {
    data object NotACallPush : IncomingCallPushRoute
    data class Ring(
        val push: IncomingCallPush,
        val updatedSeen: SeenCallRing,
    ) : IncomingCallPushRoute

    data class Suppress(val reason: IncomingCallDecision.Reason) : IncomingCallPushRoute
}

/**
 * Pure router folding the three incoming-call bricks into the single decision the
 * `MeeshyFcmService` delegates to: [IncomingCallPushParser] decodes the raw FCM
 * `data` map, [IncomingCallDecider] gates the decoded push against the live call
 * context, and — only on a ring outcome — the id is recorded in the dedup ring so
 * a retried push is caught next time.
 *
 * Total and side-effect-free: any map + context maps to exactly one
 * [IncomingCallPushRoute] and nothing throws. Ring advancement is returned as a
 * new [SeenCallRing] rather than mutated in place, keeping the app-layer holder
 * the sole owner of the live instance.
 */
object IncomingCallPushRouter {

    fun route(
        data: Map<String, String>,
        context: IncomingCallContext,
    ): IncomingCallPushRoute {
        val push = IncomingCallPushParser.parse(data) ?: return IncomingCallPushRoute.NotACallPush
        return when (val decision = IncomingCallDecider.decide(push, context)) {
            is IncomingCallDecision.Ring -> IncomingCallPushRoute.Ring(
                push = decision.push,
                updatedSeen = context.seen.insert(push.callId, context.nowMillis),
            )

            is IncomingCallDecision.Ignore -> IncomingCallPushRoute.Suppress(decision.reason)
        }
    }
}
