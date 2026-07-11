package me.meeshy.app.push

import me.meeshy.sdk.model.call.IncomingCallContext
import me.meeshy.sdk.model.call.IncomingCallPushRoute
import me.meeshy.sdk.model.call.IncomingCallPushRouter
import me.meeshy.sdk.model.call.SeenCallRing
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The single stateful owner of the live incoming-call dedup ring (app-layer
 * orchestration — the FCM service is re-instantiated per delivery, so the ring
 * cannot live on it). Each [route] threads the current ring through the pure
 * [IncomingCallPushRouter] and persists the advanced ring **only** on a ring
 * outcome, so a retried VoIP push for the same call is caught while a suppressed
 * (self / busy / duplicate) push never poisons future rings.
 *
 * Access is synchronized because FCM deliveries and a call teardown ([forget])
 * may land on different threads.
 */
@Singleton
class IncomingCallRingStore @Inject constructor() {

    private val lock = Any()
    private var seen: SeenCallRing = SeenCallRing()

    /**
     * Route one FCM `data` map against the live ring. On [IncomingCallPushRoute.Ring]
     * and [IncomingCallPushRoute.StopRing] the returned ring is adopted as the new
     * live ring (a stop records the dead id so a late-delivered original ring push
     * stays silent); every other outcome leaves it untouched.
     */
    fun route(
        data: Map<String, String>,
        nowMillis: Long,
        activeCallId: String? = null,
        selfUserId: String? = null,
    ): IncomingCallPushRoute = synchronized(lock) {
        val context = IncomingCallContext(
            nowMillis = nowMillis,
            activeCallId = activeCallId,
            seen = seen,
            selfUserId = selfUserId,
        )
        when (val route = IncomingCallPushRouter.route(data, context)) {
            is IncomingCallPushRoute.Ring -> route.also { seen = it.updatedSeen }
            is IncomingCallPushRoute.StopRing -> route.also { seen = it.updatedSeen }
            else -> route
        }
    }

    /**
     * Forget a recorded call id (e.g. the ring was refused / torn down before it
     * connected) so a fresh delivery of that same id may ring again.
     */
    fun forget(callId: String) = synchronized(lock) {
        seen = seen.remove(callId)
    }
}
