package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of the pure video-survival policy: a sustained degraded
 * link drops to audio-only, a sustained recovery brings video back, and the
 * time-based hysteresis absorbs transient spikes and dips without oscillating.
 * Every branch of `reduce` is pinned; timestamps are monotonic seconds fed by
 * the test so the machine is fully deterministic.
 */
class VideoSurvivalPolicyTest {

    private val policy = VideoSurvivalPolicy(suspendAfterSeconds = 6.0, resumeAfterSeconds = 10.0)

    private fun sending(degradedSince: Double? = null, recoveringSince: Double? = null) =
        VideoSurvivalState(isSending = true, degradedSince = degradedSince, recoveringSince = recoveringSince)

    private fun suspended(recoveringSince: Double? = null) =
        VideoSurvivalState(isSending = false, degradedSince = null, recoveringSince = recoveringSince)

    // --- user intent gate ------------------------------------------------------

    @Test
    fun `no camera intent resets to initial and does nothing`() {
        val decision = policy.reduce(
            state = suspended(recoveringSince = 3.0),
            level = VideoQualityLevel.CRITICAL,
            nowSeconds = 100.0,
            userWantsVideo = false,
        )
        assertThat(decision.state).isEqualTo(VideoSurvivalState.INITIAL)
        assertThat(decision.action).isEqualTo(VideoSurvivalAction.None)
    }

    // --- while sending: opening + holding the degraded streak ------------------

    @Test
    fun `first degraded sample while sending opens the streak without suspending`() {
        val decision = policy.reduce(sending(), VideoQualityLevel.POOR, nowSeconds = 50.0, userWantsVideo = true)
        assertThat(decision.action).isEqualTo(VideoSurvivalAction.None)
        assertThat(decision.state).isEqualTo(sending(degradedSince = 50.0))
    }

    @Test
    fun `a critical sample also counts as degraded`() {
        val decision = policy.reduce(sending(), VideoQualityLevel.CRITICAL, nowSeconds = 50.0, userWantsVideo = true)
        assertThat(decision.state.degradedSince).isEqualTo(50.0)
        assertThat(decision.action).isEqualTo(VideoSurvivalAction.None)
    }

    @Test
    fun `a degraded streak below the threshold keeps sending`() {
        val decision = policy.reduce(
            sending(degradedSince = 50.0),
            VideoQualityLevel.POOR,
            nowSeconds = 55.9, // 5.9s < 6s
            userWantsVideo = true,
        )
        assertThat(decision.action).isEqualTo(VideoSurvivalAction.None)
        assertThat(decision.state).isEqualTo(sending(degradedSince = 50.0)) // origin preserved
    }

    @Test
    fun `a degraded streak reaching the threshold suspends video`() {
        val decision = policy.reduce(
            sending(degradedSince = 50.0),
            VideoQualityLevel.POOR,
            nowSeconds = 56.0, // exactly 6s → boundary suspends
            userWantsVideo = true,
        )
        assertThat(decision.action).isEqualTo(VideoSurvivalAction.Suspend)
        assertThat(decision.state).isEqualTo(suspended())
    }

    @Test
    fun `a degraded streak past the threshold suspends video`() {
        val decision = policy.reduce(
            sending(degradedSince = 50.0),
            VideoQualityLevel.CRITICAL,
            nowSeconds = 60.0,
            userWantsVideo = true,
        )
        assertThat(decision.action).isEqualTo(VideoSurvivalAction.Suspend)
    }

    // --- while sending: healthy/fair clears the streak -------------------------

    @Test
    fun `a good sample while sending clears an open degraded streak`() {
        val decision = policy.reduce(
            sending(degradedSince = 50.0),
            VideoQualityLevel.GOOD,
            nowSeconds = 52.0,
            userWantsVideo = true,
        )
        assertThat(decision.action).isEqualTo(VideoSurvivalAction.None)
        assertThat(decision.state).isEqualTo(sending()) // streak wiped, still sending
    }

    @Test
    fun `a fair sample while sending clears an open degraded streak`() {
        val decision = policy.reduce(
            sending(degradedSince = 50.0),
            VideoQualityLevel.FAIR,
            nowSeconds = 52.0,
            userWantsVideo = true,
        )
        assertThat(decision.state.degradedSince).isNull()
        assertThat(decision.action).isEqualTo(VideoSurvivalAction.None)
    }

    @Test
    fun `a healthy sample while sending is a no-op on the initial state`() {
        val decision = policy.reduce(sending(), VideoQualityLevel.EXCELLENT, nowSeconds = 50.0, userWantsVideo = true)
        assertThat(decision.state).isEqualTo(VideoSurvivalState.INITIAL)
        assertThat(decision.action).isEqualTo(VideoSurvivalAction.None)
    }

    @Test
    fun `a transient good dip resets the degraded streak so a later suspend needs the full window`() {
        // Degraded at t=50, recovers at t=54 (streak wiped), degraded again at t=55.
        val opened = policy.reduce(sending(), VideoQualityLevel.POOR, 50.0, userWantsVideo = true).state
        val recovered = policy.reduce(opened, VideoQualityLevel.GOOD, 54.0, userWantsVideo = true).state
        val reopened = policy.reduce(recovered, VideoQualityLevel.POOR, 55.0, userWantsVideo = true)
        assertThat(reopened.state.degradedSince).isEqualTo(55.0) // new origin, not 50
        // At t=60 (5s after the reopened streak, but 10s after the first) still no suspend.
        val stillSending = policy.reduce(reopened.state, VideoQualityLevel.POOR, 60.0, userWantsVideo = true)
        assertThat(stillSending.action).isEqualTo(VideoSurvivalAction.None)
    }

    // --- while suspended: opening + holding the recovery streak ----------------

    @Test
    fun `first good sample while suspended opens the recovery streak without resuming`() {
        val decision = policy.reduce(suspended(), VideoQualityLevel.EXCELLENT, nowSeconds = 70.0, userWantsVideo = true)
        assertThat(decision.action).isEqualTo(VideoSurvivalAction.None)
        assertThat(decision.state).isEqualTo(suspended(recoveringSince = 70.0))
    }

    @Test
    fun `a recovery streak below the threshold stays suspended`() {
        val decision = policy.reduce(
            suspended(recoveringSince = 70.0),
            VideoQualityLevel.GOOD,
            nowSeconds = 79.9, // 9.9s < 10s
            userWantsVideo = true,
        )
        assertThat(decision.action).isEqualTo(VideoSurvivalAction.None)
        assertThat(decision.state).isEqualTo(suspended(recoveringSince = 70.0)) // origin preserved
    }

    @Test
    fun `a recovery streak reaching the threshold resumes video`() {
        val decision = policy.reduce(
            suspended(recoveringSince = 70.0),
            VideoQualityLevel.EXCELLENT,
            nowSeconds = 80.0, // exactly 10s → boundary resumes
            userWantsVideo = true,
        )
        assertThat(decision.action).isEqualTo(VideoSurvivalAction.Resume)
        assertThat(decision.state).isEqualTo(sending())
    }

    // --- while suspended: dips reset or hold the recovery streak ---------------

    @Test
    fun `a degraded sample while suspended wipes the recovery streak`() {
        val decision = policy.reduce(
            suspended(recoveringSince = 70.0),
            VideoQualityLevel.CRITICAL,
            nowSeconds = 75.0,
            userWantsVideo = true,
        )
        assertThat(decision.action).isEqualTo(VideoSurvivalAction.None)
        assertThat(decision.state).isEqualTo(suspended()) // recovery reset, still suspended
    }

    @Test
    fun `a fair sample while suspended holds the recovery streak unchanged`() {
        val state = suspended(recoveringSince = 70.0)
        val decision = policy.reduce(state, VideoQualityLevel.FAIR, nowSeconds = 75.0, userWantsVideo = true)
        assertThat(decision.action).isEqualTo(VideoSurvivalAction.None)
        assertThat(decision.state).isSameInstanceAs(state) // held verbatim, timer not restarted
    }

    @Test
    fun `a fair dip mid-recovery does not restart the resume window`() {
        // Recovery opens at t=70, dips to fair at t=75 (held), good again through t=80 → resume at the original window.
        val opened = policy.reduce(suspended(), VideoQualityLevel.GOOD, 70.0, userWantsVideo = true).state
        val held = policy.reduce(opened, VideoQualityLevel.FAIR, 75.0, userWantsVideo = true).state
        val resumed = policy.reduce(held, VideoQualityLevel.GOOD, 80.0, userWantsVideo = true)
        assertThat(resumed.action).isEqualTo(VideoSurvivalAction.Resume) // 10s from t=70, the fair dip didn't reset it
    }

    @Test
    fun `a degraded dip mid-recovery does restart the resume window`() {
        val opened = policy.reduce(suspended(), VideoQualityLevel.GOOD, 70.0, userWantsVideo = true).state
        val wiped = policy.reduce(opened, VideoQualityLevel.POOR, 75.0, userWantsVideo = true).state
        // Good again at t=80: only 5s into the new streak → still suspended.
        val stillSuspended = policy.reduce(wiped, VideoQualityLevel.GOOD, 80.0, userWantsVideo = true)
        assertThat(stillSuspended.action).isEqualTo(VideoSurvivalAction.None)
        assertThat(stillSuspended.state.recoveringSince).isEqualTo(80.0) // restarted at the dip's recovery
    }

    // --- full lifecycle --------------------------------------------------------

    @Test
    fun `a sustained degraded then recovered link suspends then resumes exactly once each`() {
        var state = VideoSurvivalState.INITIAL
        val actions = mutableListOf<VideoSurvivalAction>()
        // Degraded from t=0 through t=6 → suspend at t=6.
        for (t in 0..6) {
            val d = policy.reduce(state, VideoQualityLevel.POOR, t.toDouble(), userWantsVideo = true)
            state = d.state
            actions += d.action
        }
        // Good from t=10 through t=20 → resume at t=20.
        for (t in 10..20) {
            val d = policy.reduce(state, VideoQualityLevel.EXCELLENT, t.toDouble(), userWantsVideo = true)
            state = d.state
            actions += d.action
        }
        assertThat(actions.count { it == VideoSurvivalAction.Suspend }).isEqualTo(1)
        assertThat(actions.count { it == VideoSurvivalAction.Resume }).isEqualTo(1)
        assertThat(state).isEqualTo(VideoSurvivalState.INITIAL) // back to sending, streaks clear
    }

    @Test
    fun `default policy uses the six and ten second parity thresholds`() {
        val default = VideoSurvivalPolicy()
        // 6s degraded suspends on the default policy.
        val suspend = default.reduce(sending(degradedSince = 0.0), VideoQualityLevel.POOR, 6.0, userWantsVideo = true)
        assertThat(suspend.action).isEqualTo(VideoSurvivalAction.Suspend)
        // 10s good resumes on the default policy.
        val resume = default.reduce(suspended(recoveringSince = 0.0), VideoQualityLevel.GOOD, 10.0, userWantsVideo = true)
        assertThat(resume.action).isEqualTo(VideoSurvivalAction.Resume)
    }
}
