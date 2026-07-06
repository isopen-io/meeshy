package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Pure lifecycle/effects render decision. The SSOT every message surface reads to
 * decide ephemeral countdown / tap-to-reveal blur / view-once consumption / which
 * animations. Must be total over any input (missing duration, unknown send time,
 * clock skew, garbage counts) and never crash — the axes are independent.
 */
class MessageLifecyclePresentationTest {

    private val now = 1_000_000L

    private fun effects(
        flags: Long = 0L,
        ephemeralDuration: Int? = null,
        maxViewOnceCount: Int? = null,
    ) = MessageEffects(
        flags = flags,
        ephemeralDuration = ephemeralDuration,
        maxViewOnceCount = maxViewOnceCount,
    )

    @Test
    fun nullEffects_isTheInertDecision() {
        val result = MessageLifecyclePresentation.of(null, createdAtMillis = now, nowMillis = now)

        assertThat(result).isEqualTo(MessageLifecycle.NONE)
        assertThat(result.hasAny).isFalse()
    }

    @Test
    fun zeroFlags_isInertEvenWithParameters() {
        val result = MessageLifecyclePresentation.of(
            effects(flags = 0L, ephemeralDuration = 30),
            createdAtMillis = now,
            nowMillis = now,
        )

        assertThat(result).isEqualTo(MessageLifecycle.NONE)
    }

    // ----- ephemeral -----

    @Test
    fun ephemeral_withinWindow_countsDownRemaining() {
        val e = effects(flags = MessageEffectFlags.EPHEMERAL, ephemeralDuration = 30)
        val createdAt = now - 10_000L // 10s elapsed of a 30s window

        val state = MessageLifecyclePresentation.of(e, createdAt, now).ephemeral

        assertThat(state).isEqualTo(EphemeralState.Counting(remainingMillis = 20_000L, totalMillis = 30_000L))
    }

    @Test
    fun ephemeral_exactlyAtDeadline_isExpired() {
        val e = effects(flags = MessageEffectFlags.EPHEMERAL, ephemeralDuration = 30)
        val createdAt = now - 30_000L // remaining == 0

        assertThat(MessageLifecyclePresentation.of(e, createdAt, now).ephemeral)
            .isEqualTo(EphemeralState.Expired)
    }

    @Test
    fun ephemeral_pastDeadline_isExpired() {
        val e = effects(flags = MessageEffectFlags.EPHEMERAL, ephemeralDuration = 5)
        val createdAt = now - 60_000L

        assertThat(MessageLifecyclePresentation.of(e, createdAt, now).ephemeral)
            .isEqualTo(EphemeralState.Expired)
    }

    @Test
    fun ephemeral_futureSendTime_clampsToFullWindow() {
        val e = effects(flags = MessageEffectFlags.EPHEMERAL, ephemeralDuration = 30)
        val createdAt = now + 5_000L // clock skew: message "sent" in the future

        assertThat(MessageLifecyclePresentation.of(e, createdAt, now).ephemeral)
            .isEqualTo(EphemeralState.Counting(remainingMillis = 30_000L, totalMillis = 30_000L))
    }

    @Test
    fun ephemeral_unknownSendTime_treatedAsJustStarted() {
        val e = effects(flags = MessageEffectFlags.EPHEMERAL, ephemeralDuration = 15)

        assertThat(MessageLifecyclePresentation.of(e, createdAtMillis = null, nowMillis = now).ephemeral)
            .isEqualTo(EphemeralState.Counting(remainingMillis = 15_000L, totalMillis = 15_000L))
    }

    @Test
    fun ephemeral_missingDuration_isInactive() {
        val e = effects(flags = MessageEffectFlags.EPHEMERAL, ephemeralDuration = null)

        assertThat(MessageLifecyclePresentation.of(e, now, now).ephemeral)
            .isEqualTo(EphemeralState.Inactive)
    }

    @Test
    fun ephemeral_nonPositiveDuration_isInactive() {
        val zero = effects(flags = MessageEffectFlags.EPHEMERAL, ephemeralDuration = 0)
        val negative = effects(flags = MessageEffectFlags.EPHEMERAL, ephemeralDuration = -5)

        assertThat(MessageLifecyclePresentation.of(zero, now, now).ephemeral)
            .isEqualTo(EphemeralState.Inactive)
        assertThat(MessageLifecyclePresentation.of(negative, now, now).ephemeral)
            .isEqualTo(EphemeralState.Inactive)
    }

    @Test
    fun nonEphemeralMessage_hasInactiveEphemeralState() {
        val e = effects(flags = MessageEffectFlags.BLURRED)

        assertThat(MessageLifecyclePresentation.of(e, now, now).ephemeral)
            .isEqualTo(EphemeralState.Inactive)
    }

    // ----- blur -----

    @Test
    fun blurred_notRevealed_isConcealed() {
        val e = effects(flags = MessageEffectFlags.BLURRED)

        assertThat(MessageLifecyclePresentation.of(e, now, now, revealed = false).blur)
            .isEqualTo(BlurState.Concealed)
    }

    @Test
    fun blurred_revealed_isRevealed() {
        val e = effects(flags = MessageEffectFlags.BLURRED)

        assertThat(MessageLifecyclePresentation.of(e, now, now, revealed = true).blur)
            .isEqualTo(BlurState.Revealed)
    }

    @Test
    fun notBlurred_revealFlagIgnored_isNone() {
        val e = effects(flags = MessageEffectFlags.EPHEMERAL, ephemeralDuration = 10)

        assertThat(MessageLifecyclePresentation.of(e, now, now, revealed = true).blur)
            .isEqualTo(BlurState.None)
    }

    // ----- view-once -----

    @Test
    fun viewOnce_defaultMax_availableBeforeOpen() {
        val e = effects(flags = MessageEffectFlags.VIEW_ONCE, maxViewOnceCount = null)

        assertThat(MessageLifecyclePresentation.of(e, now, now, viewCount = 0).viewOnce)
            .isEqualTo(ViewOnceState.Available(remaining = 1))
    }

    @Test
    fun viewOnce_defaultMax_consumedAfterOneView() {
        val e = effects(flags = MessageEffectFlags.VIEW_ONCE, maxViewOnceCount = null)

        assertThat(MessageLifecyclePresentation.of(e, now, now, viewCount = 1).viewOnce)
            .isEqualTo(ViewOnceState.Consumed)
    }

    @Test
    fun viewOnce_explicitMax_countsRemaining() {
        val e = effects(flags = MessageEffectFlags.VIEW_ONCE, maxViewOnceCount = 3)

        assertThat(MessageLifecyclePresentation.of(e, now, now, viewCount = 1).viewOnce)
            .isEqualTo(ViewOnceState.Available(remaining = 2))
    }

    @Test
    fun viewOnce_overConsumed_isConsumedNotNegative() {
        val e = effects(flags = MessageEffectFlags.VIEW_ONCE, maxViewOnceCount = 2)

        assertThat(MessageLifecyclePresentation.of(e, now, now, viewCount = 9).viewOnce)
            .isEqualTo(ViewOnceState.Consumed)
    }

    @Test
    fun viewOnce_nonPositiveMax_coercedToOne() {
        val zero = effects(flags = MessageEffectFlags.VIEW_ONCE, maxViewOnceCount = 0)

        assertThat(MessageLifecyclePresentation.of(zero, now, now, viewCount = 0).viewOnce)
            .isEqualTo(ViewOnceState.Available(remaining = 1))
    }

    @Test
    fun viewOnce_negativeViewCount_clampedToZero() {
        val e = effects(flags = MessageEffectFlags.VIEW_ONCE, maxViewOnceCount = 1)

        assertThat(MessageLifecyclePresentation.of(e, now, now, viewCount = -3).viewOnce)
            .isEqualTo(ViewOnceState.Available(remaining = 1))
    }

    @Test
    fun notViewOnce_viewCountIgnored_isNone() {
        val e = effects(flags = MessageEffectFlags.BLURRED)

        assertThat(MessageLifecyclePresentation.of(e, now, now, viewCount = 5).viewOnce)
            .isEqualTo(ViewOnceState.None)
    }

    // ----- appearance / persistent -----

    @Test
    fun appearanceFlags_extractedInStableBitOrder() {
        val e = effects(
            flags = MessageEffectFlags.WAOO or MessageEffectFlags.SHAKE or MessageEffectFlags.EXPLODE,
        )

        assertThat(MessageLifecyclePresentation.of(e, now, now).appearance)
            .containsExactly(AppearanceEffect.SHAKE, AppearanceEffect.EXPLODE, AppearanceEffect.WAOO)
            .inOrder()
    }

    @Test
    fun persistentFlags_extractedInStableBitOrder() {
        val e = effects(
            flags = MessageEffectFlags.SPARKLE or MessageEffectFlags.GLOW,
        )

        assertThat(MessageLifecyclePresentation.of(e, now, now).persistent)
            .containsExactly(PersistentEffect.GLOW, PersistentEffect.SPARKLE)
            .inOrder()
    }

    @Test
    fun pureAppearanceEffect_hasNoLifecycleAxes() {
        val e = effects(flags = MessageEffectFlags.CONFETTI)

        val result = MessageLifecyclePresentation.of(e, now, now)

        assertThat(result.ephemeral).isEqualTo(EphemeralState.Inactive)
        assertThat(result.blur).isEqualTo(BlurState.None)
        assertThat(result.viewOnce).isEqualTo(ViewOnceState.None)
        assertThat(result.appearance).containsExactly(AppearanceEffect.CONFETTI)
        assertThat(result.hasAny).isTrue()
    }

    // ----- combined axes -----

    @Test
    fun combinedLifecycleAndVisual_axesAreIndependent() {
        val e = effects(
            flags = MessageEffectFlags.EPHEMERAL or MessageEffectFlags.BLURRED or
                MessageEffectFlags.VIEW_ONCE or MessageEffectFlags.GLOW or MessageEffectFlags.ZOOM,
            ephemeralDuration = 20,
            maxViewOnceCount = 2,
        )
        val createdAt = now - 5_000L

        val result = MessageLifecyclePresentation.of(e, createdAt, now, revealed = true, viewCount = 1)

        assertThat(result.ephemeral)
            .isEqualTo(EphemeralState.Counting(remainingMillis = 15_000L, totalMillis = 20_000L))
        assertThat(result.blur).isEqualTo(BlurState.Revealed)
        assertThat(result.viewOnce).isEqualTo(ViewOnceState.Available(remaining = 1))
        assertThat(result.appearance).containsExactly(AppearanceEffect.ZOOM)
        assertThat(result.persistent).containsExactly(PersistentEffect.GLOW)
        assertThat(result.hasAny).isTrue()
    }

    @Test
    fun hasAny_trueWheneverAnyAxisActive() {
        assertThat(
            MessageLifecyclePresentation.of(effects(flags = MessageEffectFlags.BLURRED), now, now).hasAny,
        ).isTrue()
    }
}
