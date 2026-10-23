package me.meeshy.sdk.model

/**
 * Pure lifecycle logic for revealing a blurred / view-once message — a direct port of
 * iOS `BubbleBlurRevealLifecycle` plus the reveal→re-conceal sequence encoded
 * imperatively in `BubbleBlurRevealController.scheduleReveal()`
 * (`BubbleBlurRevealLifecycle.swift`).
 *
 * A blurred bubble hides its content behind a fog + blur; tapping it reveals the
 * content for a visibility window, after which the fog condenses back in, the blur
 * re-applies behind it, and the fog dissipates — leaving the content concealed again.
 *
 * iOS buries that animation inside a `Task`, so its timing is untestable. Here the
 * whole sequence is the pure, fully-testable [revealTimeline] (a deliberate
 * improvement over iOS); the Compose layer only replays these keyframes off the clock.
 */
object BlurRevealLifecycle {

    /** Phases of the concealment that plays after the visibility window elapses. */
    enum class Phase(val durationSeconds: Double) {
        /** The fog condensation appears over the revealed content. */
        FogIn(0.4),

        /** The blur re-applies behind the now-opaque fog. */
        BlurApply(0.4),

        /** The fog dissipates, leaving the re-blurred content. */
        FogOut(0.5),
    }

    /** Default seconds a revealed message stays visible before it re-conceals. */
    const val defaultRevealDurationSeconds: Double = 5.0

    /**
     * A request to reveal a concealed bubble — port of iOS
     * `BubbleBlurRevealLifecycle.RevealRequest`.
     */
    data class RevealRequest(val messageId: String, val isViewOnce: Boolean) {
        /** View-once reveals must first consume the server-side view counter. */
        val requiresConsume: Boolean get() = isViewOnce
    }

    /**
     * A single keyframe of the reveal animation: at [atMillis] after the reveal
     * begins, drive `isRevealed` / `fogOpacity` to these targets over
     * [animationDurationMillis].
     */
    data class Step(
        val atMillis: Long,
        val isRevealed: Boolean,
        val fogOpacity: Double,
        val animationDurationMillis: Long,
    )

    /** Where a view-once text stands: concealed, read in place, or burned ("Déjà ouvert"). */
    enum class ViewOnceStage { Sealed, Revealed, Opened }

    /** Result of closing a view-once text: its new [stage] and whether to consume the server counter. */
    data class Closure(val stage: ViewOnceStage, val consume: Boolean)

    /** The retouch gesture exists only on a revealed view-once text; every other message pays nothing. */
    fun retouchGestureActive(isViewOnce: Boolean, stage: ViewOnceStage): Boolean =
        isViewOnce && stage == ViewOnceStage.Revealed

    /** Tapping the concealed text reveals it in place; an opened text never reopens. */
    fun reveal(stage: ViewOnceStage): ViewOnceStage =
        if (stage == ViewOnceStage.Opened) stage else ViewOnceStage.Revealed

    /**
     * Retouch, leaving the screen and dismissing the bubble all close through here: only a
     * revealed text opens and consumes, so the doors can fire together and consume once.
     */
    fun close(stage: ViewOnceStage): Closure =
        if (stage == ViewOnceStage.Revealed) Closure(ViewOnceStage.Opened, consume = true)
        else Closure(stage, consume = false)

    /** A view-once text is read until closed; only a plain blurred message re-conceals on a timer. */
    fun reconcealsOnTimeout(isViewOnce: Boolean): Boolean = !isViewOnce

    private const val REVEAL_SPRING_MILLIS: Long = 300
    private const val PHASE_OVERLAP_MILLIS: Long = 50

    /**
     * The full reveal → re-conceal sequence for a [visibilitySeconds] window, as an
     * ordered list of timed keyframes. Mirrors the exact timing of iOS
     * `scheduleReveal()`:
     *  - t0: reveal (fog clears, content shown) with the spring reveal
     *  - +visibility: the fog condenses in ([Phase.FogIn])
     *  - +(fogIn − 0.05): the blur re-applies behind the fog ([Phase.BlurApply])
     *  - +(blurApply + 0.05): the fog dissipates ([Phase.FogOut])
     *
     * The two 0.05s overlaps mirror the `- 0.05` / `+ 0.05` sleeps in the iOS `Task`.
     * A non-positive [visibilitySeconds] clamps to 0 so a zero-dwell reveal still runs
     * the fog sequence immediately rather than being scheduled in the past.
     */
    fun revealTimeline(visibilitySeconds: Double = defaultRevealDurationSeconds): List<Step> {
        val visibilityMs = (maxOf(0.0, visibilitySeconds) * 1_000).toLong()
        val fogInMs = phaseMillis(Phase.FogIn)
        val blurApplyMs = phaseMillis(Phase.BlurApply)
        val fogOutMs = phaseMillis(Phase.FogOut)

        val fogInAt = visibilityMs
        val reblurAt = fogInAt + fogInMs - PHASE_OVERLAP_MILLIS
        val fogOutAt = reblurAt + blurApplyMs + PHASE_OVERLAP_MILLIS

        return listOf(
            Step(
                atMillis = 0,
                isRevealed = true,
                fogOpacity = 0.0,
                animationDurationMillis = REVEAL_SPRING_MILLIS,
            ),
            Step(
                atMillis = fogInAt,
                isRevealed = true,
                fogOpacity = 1.0,
                animationDurationMillis = fogInMs,
            ),
            Step(
                atMillis = reblurAt,
                isRevealed = false,
                fogOpacity = 1.0,
                animationDurationMillis = blurApplyMs,
            ),
            Step(
                atMillis = fogOutAt,
                isRevealed = false,
                fogOpacity = 0.0,
                animationDurationMillis = fogOutMs,
            ),
        )
    }

    private fun phaseMillis(phase: Phase): Long = (phase.durationSeconds * 1_000).toLong()
}
