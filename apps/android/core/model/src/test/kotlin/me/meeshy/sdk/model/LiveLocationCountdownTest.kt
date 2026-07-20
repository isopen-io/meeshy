package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.LiveLocationCountdown.Tier
import org.junit.Test

/**
 * Behavioural coverage for [LiveLocationCountdown] — port of `formattedRemaining` in iOS
 * `LiveLocationBadge.swift`. The three magnitude bands (hours / minutes / seconds), the
 * boundary transitions between them, the zero-padded minor component, whole-second
 * flooring, and the clamp of a negative reading.
 */
class LiveLocationCountdownTest {

    private fun ofSeconds(seconds: Long) = LiveLocationCountdown.of(remainingMillis = seconds * 1_000L)

    @Test
    fun hoursBand_splitsAndLabels() {
        val r = ofSeconds(3_665) // 1h 01m 05s
        assertThat(r.tier).isEqualTo(Tier.HOURS)
        assertThat(r.hours).isEqualTo(1)
        assertThat(r.minutes).isEqualTo(1)
        assertThat(r.seconds).isEqualTo(5)
        assertThat(r.clockLabel).isEqualTo("1h01")
    }

    @Test
    fun hoursBand_zeroPadsTheMinutes() {
        val r = ofSeconds(2 * 3_600 + 5 * 60) // 2h 05m
        assertThat(r.clockLabel).isEqualTo("2h05")
    }

    @Test
    fun exactlyOneHour_entersHoursBand() {
        val r = ofSeconds(3_600)
        assertThat(r.tier).isEqualTo(Tier.HOURS)
        assertThat(r.clockLabel).isEqualTo("1h00")
    }

    @Test
    fun justBelowOneHour_staysInMinutesBand() {
        val r = ofSeconds(3_599) // 59m 59s
        assertThat(r.tier).isEqualTo(Tier.MINUTES)
        assertThat(r.minutes).isEqualTo(59)
        assertThat(r.seconds).isEqualTo(59)
        assertThat(r.clockLabel).isEqualTo("59min59")
    }

    @Test
    fun minutesBand_zeroPadsTheSeconds() {
        val r = ofSeconds(5 * 60 + 3) // 5m 03s
        assertThat(r.tier).isEqualTo(Tier.MINUTES)
        assertThat(r.clockLabel).isEqualTo("5min03")
    }

    @Test
    fun exactlyOneMinute_entersMinutesBand() {
        val r = ofSeconds(60)
        assertThat(r.tier).isEqualTo(Tier.MINUTES)
        assertThat(r.clockLabel).isEqualTo("1min00")
    }

    @Test
    fun justBelowOneMinute_staysInSecondsBand() {
        val r = ofSeconds(59)
        assertThat(r.tier).isEqualTo(Tier.SECONDS)
        assertThat(r.seconds).isEqualTo(59)
        assertThat(r.clockLabel).isEqualTo("59s")
    }

    @Test
    fun secondsBand_labelsRawSeconds() {
        val r = ofSeconds(42)
        assertThat(r.tier).isEqualTo(Tier.SECONDS)
        assertThat(r.clockLabel).isEqualTo("42s")
    }

    @Test
    fun subSecondMillis_floorTowardZero() {
        val r = LiveLocationCountdown.of(remainingMillis = 42_900L) // 42.9s → 42s
        assertThat(r.seconds).isEqualTo(42)
        assertThat(r.clockLabel).isEqualTo("42s")
    }

    @Test
    fun zeroRemaining_isZeroSeconds() {
        val r = LiveLocationCountdown.of(remainingMillis = 0L)
        assertThat(r.tier).isEqualTo(Tier.SECONDS)
        assertThat(r.clockLabel).isEqualTo("0s")
    }

    @Test
    fun negativeRemaining_clampsToZero() {
        val r = LiveLocationCountdown.of(remainingMillis = -5_000L)
        assertThat(r.hours).isEqualTo(0)
        assertThat(r.minutes).isEqualTo(0)
        assertThat(r.seconds).isEqualTo(0)
        assertThat(r.clockLabel).isEqualTo("0s")
    }
}
