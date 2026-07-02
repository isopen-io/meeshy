package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure FCM call-push router — the single decision the
 * `MeeshyFcmService` glue delegates to. It folds three already-tested bricks into
 * one total function: parse the raw `data` map, gate it through the decider, and
 * on a ring outcome advance the dedup ring so a retried push is suppressed.
 *
 * Tested through `IncomingCallPushRouter.route(data, context)` only — the raw FCM
 * map in, the typed instruction out.
 */
class IncomingCallPushRouterTest {

    private fun data(
        type: String? = "call",
        callId: String? = "call-1",
        callerUserId: String? = "caller-9",
        conversationId: String? = "conv-1",
        isVideo: String? = null,
    ): Map<String, String> = buildMap {
        type?.let { put("type", it) }
        callId?.let { put("callId", it) }
        callerUserId?.let { put("callerUserId", it) }
        conversationId?.let { put("conversationId", it) }
        isVideo?.let { put("isVideo", it) }
    }

    private fun route(
        data: Map<String, String>,
        activeCallId: String? = null,
        seen: SeenCallRing = SeenCallRing(),
        selfUserId: String? = null,
        nowMillis: Long = 0,
    ): IncomingCallPushRoute =
        IncomingCallPushRouter.route(
            data,
            IncomingCallContext(
                nowMillis = nowMillis,
                activeCallId = activeCallId,
                seen = seen,
                selfUserId = selfUserId,
            ),
        )

    private fun suppressReason(route: IncomingCallPushRoute): IncomingCallDecision.Reason =
        (route as IncomingCallPushRoute.Suppress).reason

    private fun ring(route: IncomingCallPushRoute): IncomingCallPushRoute.Ring =
        route as IncomingCallPushRoute.Ring

    // --- Not a call push ----------------------------------------------------

    @Test
    fun `a non-call data map falls through to the normal push path`() {
        assertThat(route(data(type = "message")))
            .isEqualTo(IncomingCallPushRoute.NotACallPush)
    }

    @Test
    fun `a typeless data map is not a call push`() {
        assertThat(route(data(type = null)))
            .isEqualTo(IncomingCallPushRoute.NotACallPush)
    }

    @Test
    fun `a call-type push with a blank call id is not a call push`() {
        assertThat(route(data(callId = " ")))
            .isEqualTo(IncomingCallPushRoute.NotACallPush)
    }

    @Test
    fun `a voip_call type is routed like a call`() {
        assertThat(route(data(type = "voip_call")))
            .isInstanceOf(IncomingCallPushRoute.Ring::class.java)
    }

    // --- Ring (happy path) --------------------------------------------------

    @Test
    fun `a fresh call on an idle device rings with the parsed push`() {
        val route = ring(route(data(callId = "c1", conversationId = "conv-9", isVideo = "true")))

        assertThat(route.push.callId).isEqualTo("c1")
        assertThat(route.push.conversationId).isEqualTo("conv-9")
        assertThat(route.push.isVideo).isTrue()
    }

    @Test
    fun `ringing records the call id in the advanced dedup ring`() {
        val route = ring(route(data(callId = "c1"), nowMillis = 100))

        assertThat(route.updatedSeen.contains("c1", nowMillis = 100)).isTrue()
    }

    @Test
    fun `the advanced ring suppresses the same push replayed as a retry`() {
        val first = ring(route(data(callId = "c1"), nowMillis = 100))

        val replay = route(data(callId = "c1"), seen = first.updatedSeen, nowMillis = 200)

        assertThat(suppressReason(replay)).isEqualTo(IncomingCallDecision.Reason.DUPLICATE)
    }

    // --- Suppress -----------------------------------------------------------

    @Test
    fun `a self-initiated push is suppressed`() {
        val route = route(data(callerUserId = "me"), selfUserId = "me")

        assertThat(suppressReason(route)).isEqualTo(IncomingCallDecision.Reason.SELF_INITIATED)
    }

    @Test
    fun `a fresh call arriving during a different active call is suppressed as busy`() {
        val route = route(data(callId = "c2"), activeCallId = "c1")

        assertThat(suppressReason(route)).isEqualTo(IncomingCallDecision.Reason.BUSY)
    }

    @Test
    fun `a push for the currently-active call is suppressed as duplicate`() {
        val route = route(data(callId = "c1"), activeCallId = "c1")

        assertThat(suppressReason(route)).isEqualTo(IncomingCallDecision.Reason.DUPLICATE)
    }

    @Test
    fun `a suppressed busy push does not record the call id so it rings once free`() {
        val busy = route(data(callId = "c2"), activeCallId = "c1")
        assertThat(busy).isInstanceOf(IncomingCallPushRoute.Suppress::class.java)

        // The busy push was never recorded, so when the active call clears the
        // very same push must ring rather than be swallowed as a duplicate.
        val afterFree = route(data(callId = "c2"), activeCallId = null)
        assertThat(afterFree).isInstanceOf(IncomingCallPushRoute.Ring::class.java)
    }
}
