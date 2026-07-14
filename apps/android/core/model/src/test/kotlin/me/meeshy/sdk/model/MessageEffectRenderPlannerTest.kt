package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage for the render-side message-effects planning logic — the
 * consume-side counterpart to [MessageEffectsResolver] (which decodes a received
 * message's wire fields into a [MessageEffects]). Ports the render orchestration of
 * iOS `View.messageEffects(_:hasPlayedAppearance:)` (`MessageEffectModifiers.swift`):
 *
 * - Appearance effects (shake / zoom / explode / waoo / confetti / fireworks) are
 *   one-shot and only render while `hasPlayedAppearance == false` (iOS gates each with
 *   `&& !hasPlayedAppearance`).
 * - Persistent effects (glow / pulse / rainbow / sparkle) render continuously — the
 *   played gate never suppresses them.
 * - The glow intensity resolves `effects.glowIntensity ?? 0.5` (iOS default).
 *
 * Lifecycle bits (ephemeral / blurred / view-once) are NOT render effects and never
 * appear in either set — they drive blur/expiry behaviour handled elsewhere.
 */
class MessageEffectRenderPlannerTest {

    private fun plan(flags: Long, played: Boolean = false, glowIntensity: Double? = null) =
        MessageEffectRenderPlanner.plan(
            MessageEffects(flags = flags, glowIntensity = glowIntensity),
            hasPlayedAppearance = played,
        )

    // MARK: - No effects

    @Test
    fun plan_noEffects_isEmpty() {
        val result = plan(0L)
        assertThat(result.appearance).isEmpty()
        assertThat(result.persistent).isEmpty()
        assertThat(result.isEmpty).isTrue()
    }

    @Test
    fun plan_noEffects_glowIntensityIsDefault() {
        assertThat(plan(0L).glowIntensity).isEqualTo(MessageEffectRenderPlanner.DEFAULT_GLOW_INTENSITY)
    }

    @Test
    fun plan_lifecycleOnly_producesEmptyRenderPlan() {
        // ephemeral + blurred + view-once are behaviours, not render effects.
        val result = plan(
            MessageEffectFlags.EPHEMERAL or MessageEffectFlags.BLURRED or MessageEffectFlags.VIEW_ONCE,
        )
        assertThat(result.isEmpty).isTrue()
    }

    // MARK: - Appearance effects (one-shot, gated by hasPlayedAppearance)

    @Test
    fun plan_appearanceNotPlayed_includesAppearanceEffect() {
        assertThat(plan(MessageEffectFlags.SHAKE).appearance)
            .containsExactly(AppearanceEffect.SHAKE)
    }

    @Test
    fun plan_appearanceAlreadyPlayed_suppressesAppearanceEffect() {
        val result = plan(MessageEffectFlags.SHAKE, played = true)
        assertThat(result.appearance).isEmpty()
        assertThat(result.isEmpty).isTrue()
    }

    @Test
    fun plan_eachAppearanceBit_mapsToItsEnum() {
        assertThat(plan(MessageEffectFlags.SHAKE).appearance).containsExactly(AppearanceEffect.SHAKE)
        assertThat(plan(MessageEffectFlags.ZOOM).appearance).containsExactly(AppearanceEffect.ZOOM)
        assertThat(plan(MessageEffectFlags.EXPLODE).appearance).containsExactly(AppearanceEffect.EXPLODE)
        assertThat(plan(MessageEffectFlags.CONFETTI).appearance).containsExactly(AppearanceEffect.CONFETTI)
        assertThat(plan(MessageEffectFlags.FIREWORKS).appearance).containsExactly(AppearanceEffect.FIREWORKS)
        assertThat(plan(MessageEffectFlags.WAOO).appearance).containsExactly(AppearanceEffect.WAOO)
    }

    @Test
    fun plan_allAppearanceBits_includesEverySix() {
        assertThat(plan(MessageEffectFlags.APPEARANCE_MASK).appearance)
            .containsExactlyElementsIn(AppearanceEffect.entries)
    }

    // MARK: - Persistent effects (continuous, never gated)

    @Test
    fun plan_eachPersistentBit_mapsToItsEnum() {
        assertThat(plan(MessageEffectFlags.GLOW).persistent).containsExactly(PersistentEffect.GLOW)
        assertThat(plan(MessageEffectFlags.PULSE).persistent).containsExactly(PersistentEffect.PULSE)
        assertThat(plan(MessageEffectFlags.RAINBOW).persistent).containsExactly(PersistentEffect.RAINBOW)
        assertThat(plan(MessageEffectFlags.SPARKLE).persistent).containsExactly(PersistentEffect.SPARKLE)
    }

    @Test
    fun plan_allPersistentBits_includesEveryFour() {
        assertThat(plan(MessageEffectFlags.PERSISTENT_MASK).persistent)
            .containsExactlyElementsIn(PersistentEffect.entries)
    }

    @Test
    fun plan_persistentEffect_survivesHasPlayedGate() {
        // Continuous treatments are NOT one-shot — replaying the bubble keeps them.
        val result = plan(MessageEffectFlags.PULSE, played = true)
        assertThat(result.persistent).containsExactly(PersistentEffect.PULSE)
        assertThat(result.isEmpty).isFalse()
    }

    // MARK: - Glow intensity resolution

    @Test
    fun plan_glowWithoutIntensity_usesDefault() {
        assertThat(plan(MessageEffectFlags.GLOW).glowIntensity)
            .isEqualTo(MessageEffectRenderPlanner.DEFAULT_GLOW_INTENSITY)
    }

    @Test
    fun plan_glowWithIntensity_usesProvidedValue() {
        assertThat(plan(MessageEffectFlags.GLOW, glowIntensity = 0.9).glowIntensity).isEqualTo(0.9)
    }

    // MARK: - Mixed appearance + persistent

    @Test
    fun plan_mixedNotPlayed_includesBothSets() {
        val result = plan(MessageEffectFlags.SHAKE or MessageEffectFlags.GLOW)
        assertThat(result.appearance).containsExactly(AppearanceEffect.SHAKE)
        assertThat(result.persistent).containsExactly(PersistentEffect.GLOW)
        assertThat(result.isEmpty).isFalse()
    }

    @Test
    fun plan_mixedAlreadyPlayed_keepsOnlyPersistent() {
        val result = plan(MessageEffectFlags.SHAKE or MessageEffectFlags.GLOW, played = true)
        assertThat(result.appearance).isEmpty()
        assertThat(result.persistent).containsExactly(PersistentEffect.GLOW)
        assertThat(result.isEmpty).isFalse()
    }
}
