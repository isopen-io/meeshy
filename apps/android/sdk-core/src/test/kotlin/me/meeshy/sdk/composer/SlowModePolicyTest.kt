package me.meeshy.sdk.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure slow-mode cooldown policy (feature-parity §Chat
 * "Conversation moderation … slow mode"). A conversation may throttle how often a
 * member posts; this policy answers "may this viewer send right now, and if not,
 * how many seconds remain" from the configured interval, the viewer's last send,
 * a clock reading and whether the viewer's role is exempt.
 *
 * SOTA over iOS: iOS surfaces `slowModeSeconds` only in the admin settings picker
 * and never throttles the composer, so a member fires messages faster than the
 * interval and lets the server reject them. Android enforces it at the source of
 * truth with a live countdown. Every expectation is a hand-written literal
 * asserted through the public API, never the input echoed back.
 */
class SlowModePolicyTest {

    private companion object {
        const val NOW = 1_000_000_000_000L
    }

    // MARK: - inactive postures (no throttling)

    @Test
    fun `a null interval leaves the composer unthrottled`() {
        val s = SlowModePolicy.evaluate(
            slowModeSeconds = null,
            lastSelfSentAtMillis = NOW - 1_000L,
            nowMillis = NOW,
            isExempt = false,
        )

        assertThat(s).isEqualTo(SlowModeState.UNTHROTTLED)
        assertThat(s.isActive).isFalse()
        assertThat(s.canSend).isTrue()
        assertThat(s.remainingSeconds).isEqualTo(0)
    }

    @Test
    fun `a zero interval leaves the composer unthrottled`() {
        val s = SlowModePolicy.evaluate(
            slowModeSeconds = 0,
            lastSelfSentAtMillis = NOW,
            nowMillis = NOW,
            isExempt = false,
        )

        assertThat(s).isEqualTo(SlowModeState.UNTHROTTLED)
    }

    @Test
    fun `a negative interval is treated as off, not as an infinite cooldown`() {
        val s = SlowModePolicy.evaluate(
            slowModeSeconds = -5,
            lastSelfSentAtMillis = NOW,
            nowMillis = NOW,
            isExempt = false,
        )

        assertThat(s).isEqualTo(SlowModeState.UNTHROTTLED)
    }

    @Test
    fun `an exempt viewer is never throttled even mid-cooldown`() {
        val s = SlowModePolicy.evaluate(
            slowModeSeconds = 30,
            lastSelfSentAtMillis = NOW, // just sent — a member would be blocked
            nowMillis = NOW,
            isExempt = true,
        )

        assertThat(s).isEqualTo(SlowModeState.UNTHROTTLED)
        assertThat(s.isActive).isFalse()
    }

    // MARK: - active, but the viewer may send

    @Test
    fun `a member who has never sent may post immediately under an active slow mode`() {
        val s = SlowModePolicy.evaluate(
            slowModeSeconds = 30,
            lastSelfSentAtMillis = null,
            nowMillis = NOW,
            isExempt = false,
        )

        assertThat(s.isActive).isTrue()
        assertThat(s.canSend).isTrue()
        assertThat(s.remainingSeconds).isEqualTo(0)
    }

    @Test
    fun `the cooldown clears exactly at the interval boundary`() {
        val s = SlowModePolicy.evaluate(
            slowModeSeconds = 30,
            lastSelfSentAtMillis = NOW - 30_000L, // exactly 30s ago
            nowMillis = NOW,
            isExempt = false,
        )

        assertThat(s.isActive).isTrue()
        assertThat(s.canSend).isTrue()
        assertThat(s.remainingSeconds).isEqualTo(0)
    }

    @Test
    fun `a long-idle member may send again`() {
        val s = SlowModePolicy.evaluate(
            slowModeSeconds = 30,
            lastSelfSentAtMillis = NOW - 500_000L,
            nowMillis = NOW,
            isExempt = false,
        )

        assertThat(s.canSend).isTrue()
        assertThat(s.remainingSeconds).isEqualTo(0)
    }

    // MARK: - active and blocking (countdown)

    @Test
    fun `sending just now blocks for the whole interval`() {
        val s = SlowModePolicy.evaluate(
            slowModeSeconds = 30,
            lastSelfSentAtMillis = NOW,
            nowMillis = NOW,
            isExempt = false,
        )

        assertThat(s.isActive).isTrue()
        assertThat(s.canSend).isFalse()
        assertThat(s.remainingSeconds).isEqualTo(30)
    }

    @Test
    fun `a partial cooldown rounds the remaining seconds up`() {
        // 25.2s elapsed of a 30s window → 4.8s left → shown as 5 (never 4, so the
        // countdown never claims "0" while the send is still blocked).
        val s = SlowModePolicy.evaluate(
            slowModeSeconds = 30,
            lastSelfSentAtMillis = NOW - 25_200L,
            nowMillis = NOW,
            isExempt = false,
        )

        assertThat(s.canSend).isFalse()
        assertThat(s.remainingSeconds).isEqualTo(5)
    }

    @Test
    fun `a sub-second sliver still reports one remaining second, not zero`() {
        // 1ms left of the window: still blocked, and the countdown must read 1.
        val s = SlowModePolicy.evaluate(
            slowModeSeconds = 10,
            lastSelfSentAtMillis = NOW - 9_999L,
            nowMillis = NOW,
            isExempt = false,
        )

        assertThat(s.canSend).isFalse()
        assertThat(s.remainingSeconds).isEqualTo(1)
    }

    @Test
    fun `a clock that runs backwards is clamped to a full cooldown, not a negative one`() {
        // Skew: the last-send stamp is in the future relative to now. Elapsed is
        // clamped to 0, so the viewer waits the whole interval rather than being
        // waved through by a negative remaining.
        val s = SlowModePolicy.evaluate(
            slowModeSeconds = 60,
            lastSelfSentAtMillis = NOW + 5_000L,
            nowMillis = NOW,
            isExempt = false,
        )

        assertThat(s.canSend).isFalse()
        assertThat(s.remainingSeconds).isEqualTo(60)
    }

    // MARK: - role exemption

    @Test
    fun `moderators, admins and creators are exempt from slow mode`() {
        assertThat(SlowModePolicy.isExemptRole("moderator")).isTrue()
        assertThat(SlowModePolicy.isExemptRole("admin")).isTrue()
        assertThat(SlowModePolicy.isExemptRole("creator")).isTrue()
    }

    @Test
    fun `role matching is case-insensitive`() {
        assertThat(SlowModePolicy.isExemptRole("ADMIN")).isTrue()
        assertThat(SlowModePolicy.isExemptRole("Moderator")).isTrue()
    }

    @Test
    fun `a plain member is not exempt`() {
        assertThat(SlowModePolicy.isExemptRole("member")).isFalse()
    }

    @Test
    fun `an unknown or absent role defaults to the non-exempt member posture`() {
        assertThat(SlowModePolicy.isExemptRole(null)).isFalse()
        assertThat(SlowModePolicy.isExemptRole("")).isFalse()
        assertThat(SlowModePolicy.isExemptRole("robot")).isFalse()
    }
}
