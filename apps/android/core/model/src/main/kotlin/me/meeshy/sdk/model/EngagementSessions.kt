package me.meeshy.sdk.model

/**
 * The single-focus screen region a consumption session belongs to — the port of
 * iOS `EngagementSession.Surface` (`detail`, `reels`, `storyViewer`,
 * `statusBubble`). The scrolling feed is deliberately **not** a surface: iOS only
 * tracks dwell on surfaces that show one post at a time.
 */
enum class EngagementSurface { DETAIL, REELS, STORY_VIEWER, STATUS_BUBBLE }

/**
 * A finalized, *qualified* consumption session ready to be reported. [dwellMs] is
 * the measured on-surface time; it is exactly the `duration` the Android
 * `posts/{id}/view` endpoint records.
 */
data class QualifiedView(val postId: String, val dwellMs: Long)

/**
 * Pure, immutable state machine for post-consumption dwell — the port of iOS
 * `EngagementTracker`'s bookkeeping ([apps/ios/.../Services/EngagementTracker.swift]):
 * monotonic dwell per surface, the **topmost-owns-the-clock** rule (an overlay
 * surface pauses the one underneath), and the qualified-session threshold.
 *
 * The clock is injected as a monotonic `nowMs` on every transition, so the type
 * carries no time, no I/O and no framework — the *when* (which surface, when to
 * begin/end, where to report the [QualifiedView]) lives in the feature ViewModel.
 *
 * A session qualifies — and so yields a [QualifiedView] from [end] — when its
 * dwell reaches [MIN_DWELL_MS] **or** its watch-time reaches [MIN_WATCH_MS] **or**
 * the media played to completion; otherwise it is a sub-threshold bounce and is
 * dropped (`null`), matching iOS `end`'s `guard qualifies`.
 */
@ConsistentCopyVisibility
data class EngagementSessions private constructor(
    private val sessions: Map<EngagementSurface, Active>,
    private val stack: List<EngagementSurface>,
) {
    constructor() : this(emptyMap(), emptyList())

    /**
     * Opens a session for [postId] on [surface], starting its clock at [nowMs].
     * First pauses whatever session currently owns the clock (topmost-owns-the-clock),
     * then makes this surface the new top. Re-opening an already-open surface
     * replaces its session (its dwell restarts) rather than stacking a duplicate.
     */
    fun begin(surface: EngagementSurface, postId: String, nowMs: Long): EngagementSessions {
        val paused = pauseTop(nowMs)
        val active = Active(postId = postId, accumulatedMs = 0L, runningSinceMs = nowMs)
        return EngagementSessions(
            sessions = paused.sessions + (surface to active),
            stack = paused.stack.filterNot { it == surface } + surface,
        )
    }

    /**
     * Closes [surface]'s session at [nowMs] and resumes whatever it was covering.
     * Returns the next state and, when the session qualified, the [QualifiedView]
     * to report; a sub-threshold session (and an unknown [surface]) yields `null`.
     * [watchMs]/[completed] let a video surface qualify on playback rather than dwell.
     */
    fun end(
        surface: EngagementSurface,
        nowMs: Long,
        watchMs: Long? = null,
        completed: Boolean = false,
    ): Pair<EngagementSessions, QualifiedView?> {
        val active = sessions[surface] ?: return this to null
        val dwellMs = active.currentDwell(nowMs)
        val remaining = EngagementSessions(
            sessions = sessions - surface,
            stack = stack.filterNot { it == surface },
        ).resumeTop(nowMs)
        val qualifies = dwellMs >= MIN_DWELL_MS || (watchMs ?: 0L) >= MIN_WATCH_MS || completed
        val view = if (qualifies) QualifiedView(active.postId, dwellMs) else null
        return remaining to view
    }

    private fun pauseTop(nowMs: Long): EngagementSessions {
        val top = stack.lastOrNull() ?: return this
        val session = sessions[top] ?: return this
        if (session.runningSinceMs == null) return this
        val paused = session.copy(accumulatedMs = session.currentDwell(nowMs), runningSinceMs = null)
        return copy(sessions = sessions + (top to paused))
    }

    private fun resumeTop(nowMs: Long): EngagementSessions {
        val top = stack.lastOrNull() ?: return this
        val session = sessions[top] ?: return this
        if (session.runningSinceMs != null) return this
        val resumed = session.copy(runningSinceMs = nowMs)
        return copy(sessions = sessions + (top to resumed))
    }

    private data class Active(
        val postId: String,
        val accumulatedMs: Long,
        val runningSinceMs: Long?,
    ) {
        /** Dwell so far: accumulated paused time plus the running segment, never negative. */
        fun currentDwell(nowMs: Long): Long {
            val since = runningSinceMs ?: return accumulatedMs
            return accumulatedMs + maxOf(0L, nowMs - since)
        }
    }

    companion object {
        /** Minimum on-surface dwell for a session to qualify (iOS `minDwellMs`). */
        const val MIN_DWELL_MS: Long = 1000L

        /** Minimum watch-time for a video session to qualify on playback (iOS `minWatchMs`). */
        const val MIN_WATCH_MS: Long = 2000L
    }
}
