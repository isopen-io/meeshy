package me.meeshy.sdk.model

/** A one-shot appearance effect — port of the `.shake`/`.zoom`/… appearance cases. */
enum class AppearanceEffect(val flag: Long) {
    SHAKE(MessageEffectFlags.SHAKE),
    ZOOM(MessageEffectFlags.ZOOM),
    EXPLODE(MessageEffectFlags.EXPLODE),
    CONFETTI(MessageEffectFlags.CONFETTI),
    FIREWORKS(MessageEffectFlags.FIREWORKS),
    WAOO(MessageEffectFlags.WAOO),
}

/** A continuous persistent visual treatment — port of the `.glow`/`.pulse`/… cases. */
enum class PersistentEffect(val flag: Long) {
    GLOW(MessageEffectFlags.GLOW),
    PULSE(MessageEffectFlags.PULSE),
    RAINBOW(MessageEffectFlags.RAINBOW),
    SPARKLE(MessageEffectFlags.SPARKLE),
}

/**
 * The resolved render plan for a message bubble's effects — the pure output consumed by
 * the `:sdk-ui` `Modifier.messageEffects` treatment layer. [appearance] holds the
 * one-shot effects that should still play; [persistent] holds the continuous treatments;
 * [glowIntensity] is the resolved glow strength (only meaningful when [PersistentEffect.GLOW]
 * is present).
 */
data class MessageEffectRenderPlan(
    val appearance: Set<AppearanceEffect> = emptySet(),
    val persistent: Set<PersistentEffect> = emptySet(),
    val glowIntensity: Double = MessageEffectRenderPlanner.DEFAULT_GLOW_INTENSITY,
) {
    /** True when no effect renders — no one-shot to play and no continuous treatment. */
    val isEmpty: Boolean get() = appearance.isEmpty() && persistent.isEmpty()
}

/**
 * Builds the [MessageEffectRenderPlan] for a bubble — a direct port of iOS
 * `View.messageEffects(_:hasPlayedAppearance:)` (`MessageEffectModifiers.swift`):
 *
 * - Appearance effects are one-shot: they only render while `hasPlayedAppearance == false`
 *   (iOS gates each modifier with `&& !hasPlayedAppearance`). Once played, the set is empty.
 * - Persistent effects render continuously and are never gated by the played flag.
 * - Glow intensity resolves `effects.glowIntensity ?? 0.5` (iOS `effects.glowIntensity ?? 0.5`).
 *
 * Lifecycle bits (ephemeral / blurred / view-once) are behaviours, not render effects, so
 * they never appear in the plan.
 */
object MessageEffectRenderPlanner {
    const val DEFAULT_GLOW_INTENSITY: Double = 0.5

    fun plan(effects: MessageEffects, hasPlayedAppearance: Boolean): MessageEffectRenderPlan {
        val appearance =
            if (hasPlayedAppearance) emptySet()
            else AppearanceEffect.entries.filterTo(LinkedHashSet()) { effects.has(it.flag) }
        val persistent = PersistentEffect.entries.filterTo(LinkedHashSet()) { effects.has(it.flag) }
        val glowIntensity = effects.glowIntensity ?: DEFAULT_GLOW_INTENSITY
        return MessageEffectRenderPlan(
            appearance = appearance,
            persistent = persistent,
            glowIntensity = glowIntensity,
        )
    }
}
