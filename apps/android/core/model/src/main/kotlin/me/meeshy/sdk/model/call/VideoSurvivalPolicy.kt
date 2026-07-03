package me.meeshy.sdk.model.call

/**
 * The media transition a single quality sample yields. Port of iOS
 * `VideoSurvivalAction` (`VideoSurvivalController.swift`).
 */
enum class VideoSurvivalAction {
    /** No transition — keep the current sending/suspended posture. */
    None,

    /** Drop outbound video → audio-only (the link stayed degraded long enough). */
    Suspend,

    /** Re-acquire the camera and resume sending video (the link recovered). */
    Resume,
}

/**
 * Immutable state of the survival state machine. Timestamps are **monotonic
 * seconds** (the caller feeds a monotonic clock, never wall-clock), so an
 * NTP/DST/user clock jump never triggers a spurious suspend/resume over a
 * multi-hour call. Fixed-size (two nullable timestamps + a flag) — it never
 * accumulates history, so tens of thousands of samples over a marathon call
 * cost O(1) memory. Port of iOS `VideoSurvivalState`.
 *
 * @property isSending sending (or intending to send) video when `true`;
 *   audio-only survival when `false`.
 * @property degradedSince monotonic time the current sustained *degraded* streak
 *   began (tracked only while sending); `null` when no degraded streak is open.
 * @property recoveringSince monotonic time the current sustained *good* streak
 *   began (tracked only while suspended); `null` when no recovery streak is open.
 */
data class VideoSurvivalState(
    val isSending: Boolean,
    val degradedSince: Double?,
    val recoveringSince: Double?,
) {
    companion object {
        /** The starting posture: sending video, no streak open. */
        val INITIAL = VideoSurvivalState(isSending = true, degradedSince = null, recoveringSince = null)
    }
}

/**
 * The outcome of advancing the machine by one sample: the [state] to carry
 * forward plus the [action] to actuate on this edge.
 */
data class VideoSurvivalDecision(
    val state: VideoSurvivalState,
    val action: VideoSurvivalAction,
)

/**
 * Pure, deterministic graceful-degradation policy with **time-based hysteresis**.
 * The Android SSOT ported from iOS `VideoSurvivalPolicy`.
 *
 * The adaptive bitrate ladder ([VideoQualityLevel] caps) already sheds
 * resolution/bitrate down to a `POOR` floor; this policy adds the last-resort
 * layer that ladder deliberately omits — when the link stays degraded long
 * enough that even the floor can't survive, drop outbound video so the call
 * lives on as audio-only, then bring video back once the link has clearly
 * recovered.
 *
 * Thresholds are wall-clock **durations**, not sample counts, so the policy is
 * independent of the quality monitor's cadence (5 s today, anything tomorrow)
 * and of any single dropped or late stats tick. [resumeAfterSeconds] is longer
 * than [suspendAfterSeconds] on purpose: re-acquiring the camera + renegotiating
 * is expensive, so we require the link to have clearly settled to avoid
 * oscillation.
 */
class VideoSurvivalPolicy(
    private val suspendAfterSeconds: Double = CallQualityThresholds.VIDEO_SURVIVAL_SUSPEND_AFTER_SECONDS,
    private val resumeAfterSeconds: Double = CallQualityThresholds.VIDEO_SURVIVAL_RESUME_AFTER_SECONDS,
) {

    /** A degraded level is one the adaptive ladder can no longer rescue at its floor. */
    private fun isDegraded(level: VideoQualityLevel): Boolean =
        level == VideoQualityLevel.POOR || level == VideoQualityLevel.CRITICAL

    private fun isGood(level: VideoQualityLevel): Boolean =
        level == VideoQualityLevel.EXCELLENT || level == VideoQualityLevel.GOOD

    /**
     * Advance the machine by one timestamped [level] sample. Side-effect free and
     * total over every input.
     *
     * @param nowSeconds monotonic clock reading for this sample, in seconds.
     * @param userWantsVideo the user's camera *intent*; when `false` the machine
     *   resets to [VideoSurvivalState.INITIAL] so survival never re-enables video
     *   against the user's choice.
     */
    fun reduce(
        state: VideoSurvivalState,
        level: VideoQualityLevel,
        nowSeconds: Double,
        userWantsVideo: Boolean,
    ): VideoSurvivalDecision {
        // User isn't sending video by choice → idle; forget survival state so we
        // never re-enable video against intent.
        if (!userWantsVideo) {
            return VideoSurvivalDecision(VideoSurvivalState.INITIAL, VideoSurvivalAction.None)
        }

        if (state.isSending) {
            if (isDegraded(level)) {
                val since = state.degradedSince ?: nowSeconds
                if (nowSeconds - since >= suspendAfterSeconds) {
                    return VideoSurvivalDecision(
                        VideoSurvivalState(isSending = false, degradedSince = null, recoveringSince = null),
                        VideoSurvivalAction.Suspend,
                    )
                }
                return VideoSurvivalDecision(
                    state.copy(degradedSince = since, recoveringSince = null),
                    VideoSurvivalAction.None,
                )
            }
            // Healthy/fair while sending → the adaptive ladder owns bitrate; we
            // just clear the degraded streak.
            return VideoSurvivalDecision(
                state.copy(degradedSince = null, recoveringSince = null),
                VideoSurvivalAction.None,
            )
        }

        // Audio-only survival: require a sustained good streak before resuming.
        if (isGood(level)) {
            val since = state.recoveringSince ?: nowSeconds
            if (nowSeconds - since >= resumeAfterSeconds) {
                return VideoSurvivalDecision(
                    VideoSurvivalState(isSending = true, degradedSince = null, recoveringSince = null),
                    VideoSurvivalAction.Resume,
                )
            }
            return VideoSurvivalDecision(
                state.copy(recoveringSince = since),
                VideoSurvivalAction.None,
            )
        }
        if (isDegraded(level)) {
            // Degraded again → wipe the recovery timer.
            return VideoSurvivalDecision(
                state.copy(recoveringSince = null),
                VideoSurvivalAction.None,
            )
        }
        // `FAIR` HOLDS the recovery timer: a brief mid-recovery dip shouldn't
        // restart the whole recovery window.
        return VideoSurvivalDecision(state, VideoSurvivalAction.None)
    }
}
