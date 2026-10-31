package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Le sélecteur d'éphémère d'iOS (#8303, `EphemeralChoice.menu`) : la flamme-œil
 * « Après lecture », puis 15 s, puis les durées. La flamme-œil ne voyage sur le fil
 * que par ses deux bits, jamais par une durée.
 */
class EphemeralChoiceTest {

    @Test
    fun menu_isAfterReadThenFifteenSecondsThenEveryDuration_likeIos() {
        assertThat(EphemeralChoice.menu).containsExactly(
            EphemeralChoice.AfterRead,
            EphemeralChoice.Duration(EphemeralDuration.FIFTEEN_SECONDS),
            EphemeralChoice.Duration(EphemeralDuration.THIRTY_SECONDS),
            EphemeralChoice.Duration(EphemeralDuration.ONE_MINUTE),
            EphemeralChoice.Duration(EphemeralDuration.FIVE_MINUTES),
            EphemeralChoice.Duration(EphemeralDuration.ONE_HOUR),
            EphemeralChoice.Duration(EphemeralDuration.TWENTY_FOUR_HOURS),
        ).inOrder()
    }

    @Test
    fun fifteenSeconds_shipsFifteen() {
        assertThat(EphemeralDuration.FIFTEEN_SECONDS.seconds).isEqualTo(15)
        assertThat(EphemeralDuration.fromSeconds(15)).isEqualTo(EphemeralDuration.FIFTEEN_SECONDS)
    }

    @Test
    fun afterRead_setsBothBitsAndNoDuration() {
        val armed = MessageEffectsEditor.withEphemeralChoice(
            MessageEffects(flags = MessageEffectFlags.BLURRED, ephemeralDuration = 300),
            EphemeralChoice.AfterRead,
        )
        assertThat(armed.flags).isEqualTo(
            MessageEffectFlags.BLURRED or MessageEffectFlags.EPHEMERAL or MessageEffectFlags.EPHEMERAL_AFTER_READ,
        )
        assertThat(armed.ephemeralDuration).isNull()
        assertThat(EphemeralChoice.of(armed)).isEqualTo(EphemeralChoice.AfterRead)
    }

    @Test
    fun duration_dropsTheAfterReadBitAndCarriesItsSeconds() {
        val start = MessageEffectsEditor.withEphemeralChoice(MessageEffects(), EphemeralChoice.AfterRead)
        val armed = MessageEffectsEditor.withEphemeralChoice(
            start,
            EphemeralChoice.Duration(EphemeralDuration.FIFTEEN_SECONDS),
        )
        assertThat(armed.flags).isEqualTo(MessageEffectFlags.EPHEMERAL)
        assertThat(armed.ephemeralDuration).isEqualTo(15)
        assertThat(EphemeralChoice.of(armed)).isEqualTo(EphemeralChoice.Duration(EphemeralDuration.FIFTEEN_SECONDS))
    }

    @Test
    fun off_clearsBothBitsAndTheDuration_keepingTheOtherEffects() {
        val start = MessageEffectsEditor.withEphemeralChoice(
            MessageEffects(flags = MessageEffectFlags.GLOW),
            EphemeralChoice.AfterRead,
        )
        val off = MessageEffectsEditor.withEphemeralChoice(start, null)
        assertThat(off.flags).isEqualTo(MessageEffectFlags.GLOW)
        assertThat(off.ephemeralDuration).isNull()
        assertThat(EphemeralChoice.of(off)).isNull()
    }

    @Test
    fun togglingEphemeralOff_alsoDropsTheAfterReadBit() {
        val start = MessageEffectsEditor.withEphemeralChoice(MessageEffects(), EphemeralChoice.AfterRead)
        val off = MessageEffectsEditor.toggle(start, MessageEffectFlags.EPHEMERAL)
        assertThat(off.flags).isEqualTo(0L)
    }

    @Test
    fun choiceOf_ephemeralWithoutKnownDuration_isNull() {
        assertThat(EphemeralChoice.of(MessageEffects(flags = MessageEffectFlags.EPHEMERAL))).isNull()
        assertThat(EphemeralChoice.of(MessageEffects(ephemeralDuration = 60))).isNull()
    }

    @Test
    fun afterRead_encodesBothBitsAndNoExpiry() {
        val armed = MessageEffectsEditor.withEphemeralChoice(MessageEffects(), EphemeralChoice.AfterRead)
        val wire = MessageEffectsEncoder.encode(armed, java.time.Instant.parse("2026-10-31T10:00:00Z"))
        assertThat(wire.effectFlags).isEqualTo(
            (MessageEffectFlags.EPHEMERAL or MessageEffectFlags.EPHEMERAL_AFTER_READ).toInt(),
        )
        assertThat(wire.ephemeralDuration).isNull()
        assertThat(wire.expiresAt).isNull()
    }

    @Test
    fun fifteenSeconds_encodesAnExpiryFifteenSecondsAhead() {
        val armed = MessageEffectsEditor.withEphemeralChoice(
            MessageEffects(),
            EphemeralChoice.Duration(EphemeralDuration.FIFTEEN_SECONDS),
        )
        val wire = MessageEffectsEncoder.encode(armed, java.time.Instant.parse("2026-10-31T10:00:00Z"))
        assertThat(wire.ephemeralDuration).isEqualTo(15)
        assertThat(wire.expiresAt).isEqualTo("2026-10-31T10:00:15Z")
    }
}
