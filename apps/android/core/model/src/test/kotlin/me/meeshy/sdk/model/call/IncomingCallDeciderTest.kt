package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure incoming-call gate. Faithful to the iOS
 * `VoIPPushManager` / `CallManager.reportIncomingVoIPCall` ordering: self-fanout
 * → duplicate (active or seen) → busy (different call active) → ring.
 *
 * Tested through `IncomingCallDecider.decide(push, context)` only.
 */
class IncomingCallDeciderTest {

    private fun push(callId: String = "call-1", callerUserId: String? = "caller-9"): IncomingCallPush =
        IncomingCallPush(callId = callId, callerUserId = callerUserId)

    private fun decide(
        push: IncomingCallPush,
        activeCallId: String? = null,
        seen: SeenCallRing = SeenCallRing(),
        selfUserId: String? = null,
        nowMillis: Long = 0,
    ): IncomingCallDecision =
        IncomingCallDecider.decide(
            push,
            IncomingCallContext(
                nowMillis = nowMillis,
                activeCallId = activeCallId,
                seen = seen,
                selfUserId = selfUserId,
            ),
        )

    private fun ignoreReason(decision: IncomingCallDecision): IncomingCallDecision.Reason =
        (decision as IncomingCallDecision.Ignore).reason

    // --- Ring (happy path) --------------------------------------------------

    @Test
    fun `an idle device rings for a fresh call`() {
        val p = push()
        assertThat(decide(p)).isEqualTo(IncomingCallDecision.Ring(p))
    }

    // --- Self-fanout --------------------------------------------------------

    @Test
    fun `a push from this same user is self-initiated`() {
        val decision = decide(push(callerUserId = "me"), selfUserId = "me")
        assertThat(ignoreReason(decision)).isEqualTo(IncomingCallDecision.Reason.SELF_INITIATED)
    }

    @Test
    fun `self-fanout is checked before busy so an own echo never reports busy`() {
        val decision = decide(push(callId = "c2", callerUserId = "me"), activeCallId = "c1", selfUserId = "me")
        assertThat(ignoreReason(decision)).isEqualTo(IncomingCallDecision.Reason.SELF_INITIATED)
    }

    @Test
    fun `a blank self user id does not match a blank-absent caller`() {
        val p = push(callerUserId = null)
        assertThat(decide(p, selfUserId = "")).isEqualTo(IncomingCallDecision.Ring(p))
    }

    @Test
    fun `a different caller than self still rings`() {
        val p = push(callerUserId = "other")
        assertThat(decide(p, selfUserId = "me")).isEqualTo(IncomingCallDecision.Ring(p))
    }

    // --- Duplicate ----------------------------------------------------------

    @Test
    fun `a push for the currently-active call is a duplicate`() {
        val decision = decide(push(callId = "c1"), activeCallId = "c1")
        assertThat(ignoreReason(decision)).isEqualTo(IncomingCallDecision.Reason.DUPLICATE)
    }

    @Test
    fun `an already-seen call id is a duplicate`() {
        val seen = SeenCallRing().insert("c1", nowMillis = 0)
        val decision = decide(push(callId = "c1"), seen = seen, nowMillis = 100)
        assertThat(ignoreReason(decision)).isEqualTo(IncomingCallDecision.Reason.DUPLICATE)
    }

    @Test
    fun `a call id whose dedup entry has expired is not a duplicate`() {
        val seen = SeenCallRing(ttlMillis = 1_000L).insert("c1", nowMillis = 0)
        val p = push(callId = "c1")
        assertThat(decide(p, seen = seen, nowMillis = 1_000)).isEqualTo(IncomingCallDecision.Ring(p))
    }

    // --- Busy ---------------------------------------------------------------

    @Test
    fun `a fresh call arriving while a different call is active is busy`() {
        val decision = decide(push(callId = "c2"), activeCallId = "c1")
        assertThat(ignoreReason(decision)).isEqualTo(IncomingCallDecision.Reason.BUSY)
    }

    @Test
    fun `duplicate of the active call is reported as duplicate not busy`() {
        val decision = decide(push(callId = "c1"), activeCallId = "c1")
        assertThat(ignoreReason(decision)).isEqualTo(IncomingCallDecision.Reason.DUPLICATE)
    }
}
