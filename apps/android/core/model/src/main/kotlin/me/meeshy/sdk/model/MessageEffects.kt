package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Message effect flag bits — port of MessageEffectFlags (MessageEffects.swift).
 * Bit assignments are the source of truth shared with packages/shared/types/message-effect-flags.ts.
 */
object MessageEffectFlags {
    // Axe 1: lifecycle behaviour (bits 0-7)
    const val EPHEMERAL: Long = 1L shl 0
    const val BLURRED: Long = 1L shl 1
    const val VIEW_ONCE: Long = 1L shl 2

    // Axe 2: one-shot appearance effects (bits 8-15)
    const val SHAKE: Long = 1L shl 8
    const val ZOOM: Long = 1L shl 9
    const val EXPLODE: Long = 1L shl 10
    const val CONFETTI: Long = 1L shl 11
    const val FIREWORKS: Long = 1L shl 12
    const val WAOO: Long = 1L shl 13

    // Axe 3: persistent visual effects (bits 16-23)
    const val GLOW: Long = 1L shl 16
    const val PULSE: Long = 1L shl 17
    const val RAINBOW: Long = 1L shl 18
    const val SPARKLE: Long = 1L shl 19

    const val LIFECYCLE_MASK: Long = EPHEMERAL or BLURRED or VIEW_ONCE
    const val APPEARANCE_MASK: Long = SHAKE or ZOOM or EXPLODE or CONFETTI or FIREWORKS or WAOO
    const val PERSISTENT_MASK: Long = GLOW or PULSE or RAINBOW or SPARKLE

    /** True when any bitfield bit is set — port of `MessageEffectFlags.hasAnyEffect`. */
    fun hasAny(flags: Long): Boolean = flags != 0L

    /** True when at least one lifecycle bit is set — port of `hasLifecycleEffect`. */
    fun hasLifecycle(flags: Long): Boolean = flags and LIFECYCLE_MASK != 0L

    /** True when at least one appearance bit is set — port of `hasAppearanceEffect`. */
    fun hasAppearance(flags: Long): Boolean = flags and APPEARANCE_MASK != 0L

    /** True when at least one persistent bit is set — port of `hasPersistentEffect`. */
    fun hasPersistent(flags: Long): Boolean = flags and PERSISTENT_MASK != 0L

    /** True when every bit of [effect] is set in [flags] — mirrors `OptionSet.contains`. */
    fun has(flags: Long, effect: Long): Boolean = flags and effect == effect
}

/** Appearance style for the explode effect — port of ExplodeStyle (MessageEffects.swift). */
@Serializable
enum class ExplodeStyle {
    BURST,
    SHATTER,
    DISSOLVE,
}

/** Message effects (flags + parameters) — port of MessageEffects (MessageEffects.swift). */
@Serializable
data class MessageEffects(
    val flags: Long = 0,
    val ephemeralDuration: Int? = null,
    val maxViewOnceCount: Int? = null,
    val blurRevealDuration: Double? = null,
    val zoomScale: Double? = null,
    val explodeStyle: ExplodeStyle? = null,
    val glowIntensity: Double? = null,
    val pulseFrequency: Double? = null,
    val rainbowColors: List<String>? = null,
    val sparkleIntensity: Double? = null,
) {
    val hasAnyEffect: Boolean get() = MessageEffectFlags.hasAny(flags)

    /** True when a lifecycle effect (ephemeral / blurred / view-once) is active. */
    val hasLifecycleEffect: Boolean get() = MessageEffectFlags.hasLifecycle(flags)

    /** True when a one-shot appearance effect (shake / zoom / …) is active. */
    val hasAppearanceEffect: Boolean get() = MessageEffectFlags.hasAppearance(flags)

    /** True when a persistent visual effect (glow / pulse / …) is active. */
    val hasPersistentEffect: Boolean get() = MessageEffectFlags.hasPersistent(flags)

    /** True when every bit of [effect] is present in [flags]. */
    fun has(effect: Long): Boolean = MessageEffectFlags.has(flags, effect)
}

/**
 * Resolves the [MessageEffects] carried by a message from its wire fields — a
 * direct port of the `effects` derivation in iOS `APIMessage.toMessage`
 * (`MessageModels.swift`):
 *
 * - When the backend supplies a positive [effectFlags] bitfield it is authoritative
 *   and the lifecycle booleans are ignored entirely.
 * - Otherwise the lifecycle flags are derived from the legacy per-behaviour fields
 *   (`isBlurred`, `isViewOnce`, expiry presence) for backwards compatibility.
 */
object MessageEffectsResolver {
    fun resolve(
        effectFlags: Int?,
        isBlurred: Boolean? = null,
        isViewOnce: Boolean? = null,
        hasExpiry: Boolean = false,
    ): MessageEffects {
        if (effectFlags != null && effectFlags > 0) {
            return MessageEffects(flags = effectFlags.toLong() and 0xFFFFFFFFL)
        }
        var flags = 0L
        if (isBlurred == true) flags = flags or MessageEffectFlags.BLURRED
        if (isViewOnce == true) flags = flags or MessageEffectFlags.VIEW_ONCE
        if (hasExpiry) flags = flags or MessageEffectFlags.EPHEMERAL
        return MessageEffects(flags = flags)
    }
}
