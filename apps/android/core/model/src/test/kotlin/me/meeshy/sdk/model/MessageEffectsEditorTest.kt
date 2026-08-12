package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage for the composer-side message-effects editing logic — the
 * send-side counterpart to [MessageEffectsResolver]. Ports the interaction rules of
 * iOS `EffectsPickerView` (toggle a chip, pick an ephemeral duration, clear all,
 * count the active effects) and the `EphemeralDuration` wire enum (CoreModels.swift).
 *
 * The `EphemeralDuration.seconds` raw values are the shared wire contract with
 * `MessageEffects.ephemeralDuration`; these tests pin those exact integers so a
 * drift is caught immediately.
 */
class MessageEffectsEditorTest {

    // MARK: - EphemeralDuration wire contract

    @Test
    fun ephemeralDuration_secondsMatchWireContract() {
        assertThat(EphemeralDuration.THIRTY_SECONDS.seconds).isEqualTo(30)
        assertThat(EphemeralDuration.ONE_MINUTE.seconds).isEqualTo(60)
        assertThat(EphemeralDuration.FIVE_MINUTES.seconds).isEqualTo(300)
        assertThat(EphemeralDuration.ONE_HOUR.seconds).isEqualTo(3600)
        assertThat(EphemeralDuration.TWENTY_FOUR_HOURS.seconds).isEqualTo(86400)
    }

    @Test
    fun ephemeralDuration_entriesAreOrderedShortestToLongest() {
        // The picker renders the chips in this order — parity with iOS allCases.
        assertThat(EphemeralDuration.entries.map { it.seconds })
            .containsExactly(30, 60, 300, 3600, 86400)
            .inOrder()
    }

    @Test
    fun fromSeconds_returnsMatchingDuration() {
        assertThat(EphemeralDuration.fromSeconds(60)).isEqualTo(EphemeralDuration.ONE_MINUTE)
        assertThat(EphemeralDuration.fromSeconds(300)).isEqualTo(EphemeralDuration.FIVE_MINUTES)
    }

    @Test
    fun fromSeconds_matchesFirstAndLastBoundary() {
        assertThat(EphemeralDuration.fromSeconds(30)).isEqualTo(EphemeralDuration.THIRTY_SECONDS)
        assertThat(EphemeralDuration.fromSeconds(86400)).isEqualTo(EphemeralDuration.TWENTY_FOUR_HOURS)
    }

    @Test
    fun fromSeconds_unknownValueReturnsNull() {
        assertThat(EphemeralDuration.fromSeconds(999)).isNull()
        assertThat(EphemeralDuration.fromSeconds(0)).isNull()
    }

    @Test
    fun fromSeconds_nullReturnsNull() {
        assertThat(EphemeralDuration.fromSeconds(null)).isNull()
    }

    // MARK: - toggle: flip a chip's bit

    @Test
    fun toggle_setsFlagWhenAbsent() {
        val result = MessageEffectsEditor.toggle(MessageEffects(), MessageEffectFlags.SHAKE)
        assertThat(result.has(MessageEffectFlags.SHAKE)).isTrue()
    }

    @Test
    fun toggle_clearsFlagWhenPresent() {
        val start = MessageEffects(flags = MessageEffectFlags.SHAKE)
        val result = MessageEffectsEditor.toggle(start, MessageEffectFlags.SHAKE)
        assertThat(result.hasAnyEffect).isFalse()
    }

    @Test
    fun toggle_leavesOtherBitsUntouchedWhenClearing() {
        val start = MessageEffects(flags = MessageEffectFlags.SHAKE or MessageEffectFlags.GLOW)
        val result = MessageEffectsEditor.toggle(start, MessageEffectFlags.SHAKE)
        assertThat(result.has(MessageEffectFlags.SHAKE)).isFalse()
        assertThat(result.has(MessageEffectFlags.GLOW)).isTrue()
    }

    @Test
    fun toggle_leavesOtherBitsUntouchedWhenSetting() {
        val start = MessageEffects(flags = MessageEffectFlags.GLOW)
        val result = MessageEffectsEditor.toggle(start, MessageEffectFlags.EPHEMERAL)
        assertThat(result.has(MessageEffectFlags.GLOW)).isTrue()
        assertThat(result.has(MessageEffectFlags.EPHEMERAL)).isTrue()
    }

    @Test
    fun toggle_preservesParameters() {
        val start = MessageEffects(
            flags = MessageEffectFlags.EPHEMERAL,
            ephemeralDuration = 60,
            zoomScale = 1.5,
        )
        val result = MessageEffectsEditor.toggle(start, MessageEffectFlags.BLURRED)
        assertThat(result.ephemeralDuration).isEqualTo(60)
        assertThat(result.zoomScale).isEqualTo(1.5)
        assertThat(result.has(MessageEffectFlags.BLURRED)).isTrue()
    }

    @Test
    fun toggle_roundTripReturnsToOriginalFlags() {
        val start = MessageEffects(flags = MessageEffectFlags.GLOW)
        val once = MessageEffectsEditor.toggle(start, MessageEffectFlags.CONFETTI)
        val twice = MessageEffectsEditor.toggle(once, MessageEffectFlags.CONFETTI)
        assertThat(twice.flags).isEqualTo(start.flags)
    }

    // MARK: - activeCount: how many effect bits are on

    @Test
    fun activeCount_zeroWhenNoEffects() {
        assertThat(MessageEffectsEditor.activeCount(MessageEffects())).isEqualTo(0)
    }

    @Test
    fun activeCount_oneForSingleFlag() {
        assertThat(MessageEffectsEditor.activeCount(MessageEffects(flags = MessageEffectFlags.SHAKE)))
            .isEqualTo(1)
    }

    @Test
    fun activeCount_countsEachActiveBitAcrossAxes() {
        val effects = MessageEffects(
            flags = MessageEffectFlags.EPHEMERAL or
                MessageEffectFlags.SHAKE or
                MessageEffectFlags.GLOW,
        )
        assertThat(MessageEffectsEditor.activeCount(effects)).isEqualTo(3)
    }

    // MARK: - cleared: the "Tout effacer" reset

    @Test
    fun cleared_resetsFlagsAndParameters() {
        val populated = MessageEffects(
            flags = MessageEffectFlags.EPHEMERAL or MessageEffectFlags.RAINBOW,
            ephemeralDuration = 300,
            rainbowColors = listOf("#FF0000"),
        )
        // cleared() is parameterless — it always returns the empty effects, exactly
        // like iOS `effects = .none`, regardless of what was selected before.
        assertThat(populated.hasAnyEffect).isTrue()
        val result = MessageEffectsEditor.cleared()
        assertThat(result.flags).isEqualTo(0L)
        assertThat(result.hasAnyEffect).isFalse()
        assertThat(result.ephemeralDuration).isNull()
        assertThat(result.rainbowColors).isNull()
    }

    // MARK: - withEphemeralDuration: record the chosen self-destruct time

    @Test
    fun withEphemeralDuration_recordsSeconds() {
        val result = MessageEffectsEditor.withEphemeralDuration(
            MessageEffects(),
            EphemeralDuration.ONE_HOUR,
        )
        assertThat(result.ephemeralDuration).isEqualTo(3600)
    }

    @Test
    fun withEphemeralDuration_leavesFlagsUnchanged() {
        // The duration row only shows once EPHEMERAL is already toggled on, so
        // choosing a duration must not itself mutate the flags bitfield.
        val start = MessageEffects(flags = MessageEffectFlags.EPHEMERAL)
        val result = MessageEffectsEditor.withEphemeralDuration(start, EphemeralDuration.FIVE_MINUTES)
        assertThat(result.flags).isEqualTo(MessageEffectFlags.EPHEMERAL)
        assertThat(result.ephemeralDuration).isEqualTo(300)
    }

    @Test
    fun withEphemeralDuration_replacesPreviousDuration() {
        val start = MessageEffects(
            flags = MessageEffectFlags.EPHEMERAL,
            ephemeralDuration = 30,
        )
        val result = MessageEffectsEditor.withEphemeralDuration(start, EphemeralDuration.FIVE_MINUTES)
        assertThat(result.ephemeralDuration).isEqualTo(300)
    }
}
