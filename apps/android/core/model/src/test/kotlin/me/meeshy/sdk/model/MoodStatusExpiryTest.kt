package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MoodStatusExpiry.Tier
import org.junit.Test
import java.time.Instant

/**
 * Behavioural coverage for the pure mood-status expiry law — the Android port of
 * `StatusEntry.timeRemaining` (StoryModels.swift) and the gateway's
 * `STATUS_EXPIRY_HOURS = 1` rule (PostService.ts). `now` is injected so the law is
 * deterministic. The status TTL is **1 hour** (NOT the 21h STORY rule).
 */
class MoodStatusExpiryTest {

    private val now = Instant.parse("2026-06-17T12:00:00Z").toEpochMilli()

    private fun isoAt(millis: Long): String = Instant.ofEpochMilli(millis).toString()
    private fun isoFromNow(millis: Long): String = isoAt(now + millis)

    // --- effectiveExpiresAtMillis ---------------------------------------------

    @Test
    fun `explicit expiry is used verbatim, ignoring createdAt`() {
        val expiry = now + 5 * 60_000L
        val effective = MoodStatusExpiry.effectiveExpiresAtMillis(
            createdAt = isoAt(now - 10 * 60_000L),
            expiresAt = isoAt(expiry),
        )
        assertThat(effective).isEqualTo(expiry)
    }

    @Test
    fun `absent expiry falls back to createdAt plus one hour`() {
        val created = now - 10 * 60_000L
        val effective = MoodStatusExpiry.effectiveExpiresAtMillis(
            createdAt = isoAt(created),
            expiresAt = null,
        )
        assertThat(effective).isEqualTo(created + 60L * 60_000L)
    }

    @Test
    fun `blank expiry string falls back to createdAt plus one hour`() {
        val created = now - 10 * 60_000L
        val effective = MoodStatusExpiry.effectiveExpiresAtMillis(
            createdAt = isoAt(created),
            expiresAt = "   ",
        )
        assertThat(effective).isEqualTo(created + 60L * 60_000L)
    }

    @Test
    fun `unparseable expiry falls back to createdAt`() {
        val created = now - 10 * 60_000L
        val effective = MoodStatusExpiry.effectiveExpiresAtMillis(
            createdAt = isoAt(created),
            expiresAt = "not-a-date",
        )
        assertThat(effective).isEqualTo(created + 60L * 60_000L)
    }

    @Test
    fun `no reliable timestamps yields null effective expiry`() {
        assertThat(MoodStatusExpiry.effectiveExpiresAtMillis(null, null)).isNull()
        assertThat(MoodStatusExpiry.effectiveExpiresAtMillis("", "")).isNull()
        assertThat(MoodStatusExpiry.effectiveExpiresAtMillis("garbage", "garbage")).isNull()
    }

    // --- isExpired -------------------------------------------------------------

    @Test
    fun `expiry in the past is expired`() {
        assertThat(MoodStatusExpiry.isExpired(null, isoFromNow(-1_000L), now)).isTrue()
    }

    @Test
    fun `expiry in the future is not expired`() {
        assertThat(MoodStatusExpiry.isExpired(null, isoFromNow(30_000L), now)).isFalse()
    }

    @Test
    fun `expiry exactly at now is expired`() {
        assertThat(MoodStatusExpiry.isExpired(null, isoAt(now), now)).isTrue()
    }

    @Test
    fun `a two-hour-old status with no explicit expiry is expired via the one-hour fallback`() {
        val created = isoAt(now - 2 * 60L * 60_000L)
        assertThat(MoodStatusExpiry.isExpired(createdAt = created, expiresAt = null, nowMillis = now)).isTrue()
    }

    @Test
    fun `a fresh status with no explicit expiry is live via the one-hour fallback`() {
        val created = isoAt(now - 10 * 60_000L)
        assertThat(MoodStatusExpiry.isExpired(createdAt = created, expiresAt = null, nowMillis = now)).isFalse()
    }

    @Test
    fun `a status with no derivable timestamp is never treated as expired`() {
        assertThat(MoodStatusExpiry.isExpired(null, null, now)).isFalse()
    }

    // --- remaining -------------------------------------------------------------

    @Test
    fun `remaining under a minute is the seconds tier`() {
        val remaining = MoodStatusExpiry.remaining(null, isoFromNow(30_000L), now)
        assertThat(remaining).isNotNull()
        assertThat(remaining!!.tier).isEqualTo(Tier.SECONDS)
        assertThat(remaining.totalSeconds).isEqualTo(30L)
        assertThat(remaining.label).isEqualTo("30s")
    }

    @Test
    fun `remaining of ninety seconds is the minutes tier`() {
        val remaining = MoodStatusExpiry.remaining(null, isoFromNow(90_000L), now)!!
        assertThat(remaining.tier).isEqualTo(Tier.MINUTES)
        assertThat(remaining.minutes).isEqualTo(1L)
        assertThat(remaining.label).isEqualTo("1min")
    }

    @Test
    fun `exactly sixty seconds remaining crosses into the minutes tier`() {
        val remaining = MoodStatusExpiry.remaining(null, isoFromNow(60_000L), now)!!
        assertThat(remaining.tier).isEqualTo(Tier.MINUTES)
        assertThat(remaining.label).isEqualTo("1min")
    }

    @Test
    fun `fifty-nine seconds remaining stays in the seconds tier`() {
        val remaining = MoodStatusExpiry.remaining(null, isoFromNow(59_000L), now)!!
        assertThat(remaining.tier).isEqualTo(Tier.SECONDS)
        assertThat(remaining.label).isEqualTo("59s")
    }

    @Test
    fun `a sub-second future remainder floors to zero seconds`() {
        val remaining = MoodStatusExpiry.remaining(null, isoFromNow(500L), now)!!
        assertThat(remaining.tier).isEqualTo(Tier.SECONDS)
        assertThat(remaining.totalSeconds).isEqualTo(0L)
        assertThat(remaining.label).isEqualTo("0s")
    }

    @Test
    fun `an expired status reports the expired tier with no numeric label`() {
        val remaining = MoodStatusExpiry.remaining(null, isoFromNow(-5_000L), now)!!
        assertThat(remaining.tier).isEqualTo(Tier.EXPIRED)
        assertThat(remaining.label).isNull()
    }

    @Test
    fun `remaining is derived from the one-hour fallback when no explicit expiry exists`() {
        // created 59.5 min ago -> expiry = created + 1h = now + 30s remaining.
        val created = isoAt(now - (60L * 60_000L - 30_000L))
        val remaining = MoodStatusExpiry.remaining(createdAt = created, expiresAt = null, nowMillis = now)!!
        assertThat(remaining.tier).isEqualTo(Tier.SECONDS)
        assertThat(remaining.totalSeconds).isEqualTo(30L)
    }

    @Test
    fun `remaining is null when no timestamp is derivable`() {
        assertThat(MoodStatusExpiry.remaining(null, null, now)).isNull()
    }
}
