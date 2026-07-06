package me.meeshy.app.push

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.IncomingCallDecision
import me.meeshy.sdk.model.call.IncomingCallPushRoute
import org.junit.Test

/**
 * Behavioural spec for the app-layer live-ring holder — the single stateful owner
 * of the dedup [me.meeshy.sdk.model.call.SeenCallRing] the FCM service consults.
 * It wraps the pure [me.meeshy.sdk.model.call.IncomingCallPushRouter], threading
 * its own ring in and persisting the advanced ring back only on a ring outcome.
 *
 * Tested through the public `route` / `forget` API — the raw FCM map in, the
 * typed instruction out, with the dedup memory observed across successive calls.
 */
class IncomingCallRingStoreTest {

    private fun callData(callId: String = "c1", callerUserId: String = "caller-9"): Map<String, String> =
        mapOf("type" to "call", "callId" to callId, "callerUserId" to callerUserId, "conversationId" to "conv-1")

    private fun suppressReason(route: IncomingCallPushRoute): IncomingCallDecision.Reason =
        (route as IncomingCallPushRoute.Suppress).reason

    @Test
    fun `a fresh call push rings`() {
        val store = IncomingCallRingStore()

        val route = store.route(callData(), nowMillis = 100)

        assertThat(route).isInstanceOf(IncomingCallPushRoute.Ring::class.java)
    }

    @Test
    fun `a retried delivery of the same call is suppressed as a duplicate`() {
        val store = IncomingCallRingStore()
        store.route(callData(callId = "c1"), nowMillis = 100)

        val retry = store.route(callData(callId = "c1"), nowMillis = 200)

        assertThat(suppressReason(retry)).isEqualTo(IncomingCallDecision.Reason.DUPLICATE)
    }

    @Test
    fun `a different call still rings after a first one was recorded`() {
        val store = IncomingCallRingStore()
        store.route(callData(callId = "c1"), nowMillis = 100)

        val other = store.route(callData(callId = "c2"), nowMillis = 200)

        assertThat(other).isInstanceOf(IncomingCallPushRoute.Ring::class.java)
    }

    @Test
    fun `a re-delivery past the freshness window rings again`() {
        val store = IncomingCallRingStore()
        store.route(callData(callId = "c1"), nowMillis = 0)

        // Beyond the 30s dedup ttl the stale entry no longer suppresses.
        val late = store.route(callData(callId = "c1"), nowMillis = 30_000)

        assertThat(late).isInstanceOf(IncomingCallPushRoute.Ring::class.java)
    }

    @Test
    fun `a self-initiated push does not record the id so it never poisons the ring`() {
        val store = IncomingCallRingStore()

        val suppressed = store.route(callData(callId = "c1", callerUserId = "me"), nowMillis = 100, selfUserId = "me")
        assertThat(suppressReason(suppressed)).isEqualTo(IncomingCallDecision.Reason.SELF_INITIATED)

        // Because the suppressed push was never recorded, a genuine ring for the
        // same id (now from a different caller) still gets through.
        val genuine = store.route(callData(callId = "c1", callerUserId = "someone"), nowMillis = 200)
        assertThat(genuine).isInstanceOf(IncomingCallPushRoute.Ring::class.java)
    }

    @Test
    fun `a non-call push falls through and leaves the ring untouched`() {
        val store = IncomingCallRingStore()

        val route = store.route(mapOf("type" to "message"), nowMillis = 100)
        assertThat(route).isEqualTo(IncomingCallPushRoute.NotACallPush)

        // The ring was never advanced, so a later genuine call rings normally.
        val call = store.route(callData(callId = "c1"), nowMillis = 200)
        assertThat(call).isInstanceOf(IncomingCallPushRoute.Ring::class.java)
    }

    @Test
    fun `forgetting a recorded call id lets a fresh delivery ring again`() {
        val store = IncomingCallRingStore()
        store.route(callData(callId = "c1"), nowMillis = 100)

        store.forget("c1")

        val reReported = store.route(callData(callId = "c1"), nowMillis = 150)
        assertThat(reReported).isInstanceOf(IncomingCallPushRoute.Ring::class.java)
    }

    @Test
    fun `an active call suppresses an unrelated push as busy without recording it`() {
        val store = IncomingCallRingStore()

        val busy = store.route(callData(callId = "c2"), nowMillis = 100, activeCallId = "c1")
        assertThat(suppressReason(busy)).isEqualTo(IncomingCallDecision.Reason.BUSY)

        // Once the active call clears, the same push must ring — it was not recorded.
        val afterFree = store.route(callData(callId = "c2"), nowMillis = 200)
        assertThat(afterFree).isInstanceOf(IncomingCallPushRoute.Ring::class.java)
    }
}
