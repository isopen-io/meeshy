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
    val hasAnyEffect: Boolean get() = flags != 0L
}
