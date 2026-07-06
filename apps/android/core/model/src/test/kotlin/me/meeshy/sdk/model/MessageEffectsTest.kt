package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The bit-mask convenience accessors on [MessageEffects] — port of the iOS
 * `MessageEffectFlags` computed properties. They classify a raw flag bitfield into
 * the three effect axes (lifecycle / appearance / persistent) and the individual
 * lifecycle flags every surface gates on.
 */
class MessageEffectsTest {

    @Test
    fun noFlags_hasNothing() {
        val e = MessageEffects()

        assertThat(e.hasAnyEffect).isFalse()
        assertThat(e.hasLifecycleEffect).isFalse()
        assertThat(e.hasAppearanceEffect).isFalse()
        assertThat(e.hasPersistentEffect).isFalse()
        assertThat(e.isEphemeral).isFalse()
        assertThat(e.isBlurred).isFalse()
        assertThat(e.isViewOnce).isFalse()
    }

    @Test
    fun has_isTrueOnlyForSetBit() {
        val e = MessageEffects(flags = MessageEffectFlags.BLURRED)

        assertThat(e.has(MessageEffectFlags.BLURRED)).isTrue()
        assertThat(e.has(MessageEffectFlags.EPHEMERAL)).isFalse()
    }

    @Test
    fun ephemeralFlag_classifiesAsLifecycleOnly() {
        val e = MessageEffects(flags = MessageEffectFlags.EPHEMERAL)

        assertThat(e.isEphemeral).isTrue()
        assertThat(e.hasLifecycleEffect).isTrue()
        assertThat(e.hasAppearanceEffect).isFalse()
        assertThat(e.hasPersistentEffect).isFalse()
    }

    @Test
    fun blurredFlag_isBlurredAndLifecycle() {
        val e = MessageEffects(flags = MessageEffectFlags.BLURRED)

        assertThat(e.isBlurred).isTrue()
        assertThat(e.hasLifecycleEffect).isTrue()
    }

    @Test
    fun viewOnceFlag_isViewOnceAndLifecycle() {
        val e = MessageEffects(flags = MessageEffectFlags.VIEW_ONCE)

        assertThat(e.isViewOnce).isTrue()
        assertThat(e.hasLifecycleEffect).isTrue()
    }

    @Test
    fun appearanceFlag_classifiesAsAppearanceOnly() {
        val e = MessageEffects(flags = MessageEffectFlags.CONFETTI)

        assertThat(e.hasAppearanceEffect).isTrue()
        assertThat(e.hasLifecycleEffect).isFalse()
        assertThat(e.hasPersistentEffect).isFalse()
    }

    @Test
    fun persistentFlag_classifiesAsPersistentOnly() {
        val e = MessageEffects(flags = MessageEffectFlags.RAINBOW)

        assertThat(e.hasPersistentEffect).isTrue()
        assertThat(e.hasLifecycleEffect).isFalse()
        assertThat(e.hasAppearanceEffect).isFalse()
    }

    @Test
    fun mixedAxes_reportEachIndependently() {
        val e = MessageEffects(
            flags = MessageEffectFlags.EPHEMERAL or MessageEffectFlags.SHAKE or MessageEffectFlags.PULSE,
        )

        assertThat(e.hasLifecycleEffect).isTrue()
        assertThat(e.hasAppearanceEffect).isTrue()
        assertThat(e.hasPersistentEffect).isTrue()
        assertThat(e.isBlurred).isFalse()
    }
}
