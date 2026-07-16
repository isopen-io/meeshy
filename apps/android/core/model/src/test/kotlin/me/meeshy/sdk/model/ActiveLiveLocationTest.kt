package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage for [ActiveLiveLocation] — port of iOS `ActiveLiveLocation`
 * (`LocationModels.swift`). Identity by user, the inclusive-deadline `isExpired`, the
 * clamped `remainingMillis`, and the `startingAt` factory that turns a requested window
 * into a deadline (guarding a bogus non-positive window).
 */
class ActiveLiveLocationTest {

    private fun session(
        expiresAtMillis: Long,
        startedAtMillis: Long = 0L,
    ) = ActiveLiveLocation(
        userId = "u1",
        username = "alice",
        latitude = 48.85,
        longitude = 2.35,
        expiresAtMillis = expiresAtMillis,
        startedAtMillis = startedAtMillis,
        lastUpdatedMillis = startedAtMillis,
    )

    @Test
    fun id_isTheUserId() {
        assertThat(session(expiresAtMillis = 1_000L).id).isEqualTo("u1")
    }

    @Test
    fun isExpired_beforeDeadline_isFalse() {
        assertThat(session(expiresAtMillis = 10_000L).isExpired(nowEpochMillis = 9_999L)).isFalse()
    }

    @Test
    fun isExpired_atDeadline_isTrue() {
        assertThat(session(expiresAtMillis = 10_000L).isExpired(nowEpochMillis = 10_000L)).isTrue()
    }

    @Test
    fun isExpired_afterDeadline_isTrue() {
        assertThat(session(expiresAtMillis = 10_000L).isExpired(nowEpochMillis = 10_001L)).isTrue()
    }

    @Test
    fun remainingMillis_beforeDeadline_isThePositiveGap() {
        assertThat(session(expiresAtMillis = 10_000L).remainingMillis(nowEpochMillis = 6_000L))
            .isEqualTo(4_000L)
    }

    @Test
    fun remainingMillis_pastDeadline_clampsToZero() {
        assertThat(session(expiresAtMillis = 10_000L).remainingMillis(nowEpochMillis = 12_000L))
            .isEqualTo(0L)
    }

    @Test
    fun startingAt_derivesDeadlineFromWindow() {
        val s = ActiveLiveLocation.startingAt(
            userId = "u2",
            username = "bob",
            latitude = 1.0,
            longitude = 2.0,
            durationMinutes = 15,
            startedAtMillis = 1_000_000L,
        )
        assertThat(s.expiresAtMillis).isEqualTo(1_000_000L + 900_000L)
        assertThat(s.startedAtMillis).isEqualTo(1_000_000L)
        assertThat(s.lastUpdatedMillis).isEqualTo(1_000_000L)
    }

    @Test
    fun startingAt_nonPositiveWindow_isImmediatelyExpired() {
        val s = ActiveLiveLocation.startingAt(
            userId = "u3",
            username = "carol",
            latitude = 0.0,
            longitude = 0.0,
            durationMinutes = -30,
            startedAtMillis = 5_000L,
        )
        assertThat(s.expiresAtMillis).isEqualTo(5_000L)
        assertThat(s.isExpired(nowEpochMillis = 5_000L)).isTrue()
    }

    @Test
    fun startingAt_carriesTheMotionVector() {
        val s = ActiveLiveLocation.startingAt(
            userId = "u4",
            username = "dan",
            latitude = 3.0,
            longitude = 4.0,
            durationMinutes = 60,
            startedAtMillis = 0L,
            speed = 5.5,
            heading = 90.0,
        )
        assertThat(s.speed).isEqualTo(5.5)
        assertThat(s.heading).isEqualTo(90.0)
    }
}
