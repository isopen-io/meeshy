package me.meeshy.sdk.model

/** Self-destruct (ephemeral) render state — port of the iOS ephemeral countdown. */
sealed interface EphemeralState {
    /** The message is not ephemeral (or its duration is unusable). */
    data object Inactive : EphemeralState

    /** Still alive: [remainingMillis] left of a [totalMillis] window (both > 0). */
    data class Counting(val remainingMillis: Long, val totalMillis: Long) : EphemeralState

    /** The window elapsed — the content should self-destruct. */
    data object Expired : EphemeralState
}

/** Tap-to-reveal blur render state. */
sealed interface BlurState {
    /** The message is not blurred. */
    data object None : BlurState

    /** Blurred and not yet revealed — a natural tap uncovers it. */
    data object Concealed : BlurState

    /** The viewer revealed the blurred content. */
    data object Revealed : BlurState
}

/** Limited-view (view-once) render state. */
sealed interface ViewOnceState {
    /** The message is not view-once. */
    data object None : ViewOnceState

    /** Still openable: [remaining] views left (> 0). */
    data class Available(val remaining: Int) : ViewOnceState

    /** All allowed views were used — the content should hide. */
    data object Consumed : ViewOnceState
}

/** One-shot appearance animations, in stable bit order. */
enum class AppearanceEffect { SHAKE, ZOOM, EXPLODE, CONFETTI, FIREWORKS, WAOO }

/** Persistent visual styles, in stable bit order. */
enum class PersistentEffect { GLOW, PULSE, RAINBOW, SPARKLE }

/**
 * Immutable render decision for a message carrying [MessageEffects].
 *
 * The lifecycle axes (ephemeral / blur / view-once) and the visual axes
 * (appearance / persistent) are independent — a single message may combine them.
 */
data class MessageLifecycle(
    val ephemeral: EphemeralState,
    val blur: BlurState,
    val viewOnce: ViewOnceState,
    val appearance: List<AppearanceEffect>,
    val persistent: List<PersistentEffect>,
) {
    /** True when any axis is active — the surface must render a lifecycle affordance. */
    val hasAny: Boolean
        get() = ephemeral != EphemeralState.Inactive ||
            blur != BlurState.None ||
            viewOnce != ViewOnceState.None ||
            appearance.isNotEmpty() ||
            persistent.isNotEmpty()

    companion object {
        /** The inert decision for a message with no (usable) effects. */
        val NONE: MessageLifecycle = MessageLifecycle(
            ephemeral = EphemeralState.Inactive,
            blur = BlurState.None,
            viewOnce = ViewOnceState.None,
            appearance = emptyList(),
            persistent = emptyList(),
        )
    }
}

/**
 * Pure SSOT projecting a message's [MessageEffects] into an immutable
 * [MessageLifecycle] render decision — the single, total, side-effect-free answer to
 * "is it expired / concealed / how many views left / which animations".
 *
 * iOS computes these scattered across its message views; Android centralises them so
 * every surface (chat bubble, story reply) reads the same decision. Runtime inputs
 * ([nowMillis], [revealed], [viewCount]) are supplied by the UI each frame; the
 * decision owns no state.
 */
object MessageLifecyclePresentation {

    /**
     * @param effects the message's effects (or `null` for a plain message).
     * @param createdAtMillis the epoch millis the message was sent (drives the
     *   ephemeral countdown); `null` when unknown → the window is treated as just
     *   started (full remaining) rather than instantly expired.
     * @param nowMillis the current epoch millis (the caller re-supplies it each tick).
     * @param revealed whether the viewer uncovered a blurred message.
     * @param viewCount how many times a view-once message was opened.
     */
    fun of(
        effects: MessageEffects?,
        createdAtMillis: Long?,
        nowMillis: Long,
        revealed: Boolean = false,
        viewCount: Int = 0,
    ): MessageLifecycle {
        if (effects == null || !effects.hasAnyEffect) return MessageLifecycle.NONE
        return MessageLifecycle(
            ephemeral = ephemeralState(effects, createdAtMillis, nowMillis),
            blur = blurState(effects, revealed),
            viewOnce = viewOnceState(effects, viewCount),
            appearance = appearanceEffects(effects.flags),
            persistent = persistentEffects(effects.flags),
        )
    }

    private fun ephemeralState(
        effects: MessageEffects,
        createdAtMillis: Long?,
        nowMillis: Long,
    ): EphemeralState {
        if (!effects.isEphemeral) return EphemeralState.Inactive
        val seconds = effects.ephemeralDuration ?: return EphemeralState.Inactive
        if (seconds <= 0) return EphemeralState.Inactive
        val totalMillis = seconds.toLong() * 1_000L
        if (createdAtMillis == null) return EphemeralState.Counting(totalMillis, totalMillis)
        val elapsed = (nowMillis - createdAtMillis).coerceAtLeast(0L)
        val remaining = totalMillis - elapsed
        return if (remaining <= 0L) {
            EphemeralState.Expired
        } else {
            EphemeralState.Counting(remaining, totalMillis)
        }
    }

    private fun blurState(effects: MessageEffects, revealed: Boolean): BlurState = when {
        !effects.isBlurred -> BlurState.None
        revealed -> BlurState.Revealed
        else -> BlurState.Concealed
    }

    private fun viewOnceState(effects: MessageEffects, viewCount: Int): ViewOnceState {
        if (!effects.isViewOnce) return ViewOnceState.None
        val max = (effects.maxViewOnceCount ?: 1).coerceAtLeast(1)
        val used = viewCount.coerceAtLeast(0)
        val remaining = max - used
        return if (remaining <= 0) ViewOnceState.Consumed else ViewOnceState.Available(remaining)
    }

    private fun appearanceEffects(flags: Long): List<AppearanceEffect> = buildList {
        if (flags and MessageEffectFlags.SHAKE != 0L) add(AppearanceEffect.SHAKE)
        if (flags and MessageEffectFlags.ZOOM != 0L) add(AppearanceEffect.ZOOM)
        if (flags and MessageEffectFlags.EXPLODE != 0L) add(AppearanceEffect.EXPLODE)
        if (flags and MessageEffectFlags.CONFETTI != 0L) add(AppearanceEffect.CONFETTI)
        if (flags and MessageEffectFlags.FIREWORKS != 0L) add(AppearanceEffect.FIREWORKS)
        if (flags and MessageEffectFlags.WAOO != 0L) add(AppearanceEffect.WAOO)
    }

    private fun persistentEffects(flags: Long): List<PersistentEffect> = buildList {
        if (flags and MessageEffectFlags.GLOW != 0L) add(PersistentEffect.GLOW)
        if (flags and MessageEffectFlags.PULSE != 0L) add(PersistentEffect.PULSE)
        if (flags and MessageEffectFlags.RAINBOW != 0L) add(PersistentEffect.RAINBOW)
        if (flags and MessageEffectFlags.SPARKLE != 0L) add(PersistentEffect.SPARKLE)
    }
}
