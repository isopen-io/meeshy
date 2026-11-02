package me.meeshy.sdk.model.presence

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.UserPresence
import org.junit.Test
import java.time.Instant

/**
 * Ce que la carte de présence garde sur disque : tant que son point se dessine (5 min), jamais le compte courant,
 * jamais une date inventée (#13774).
 */
class PresenceRetentionTest {

    private val now = 1_700_000_000_000L
    private fun iso(offsetMs: Long) = Instant.ofEpochMilli(now + offsetMs).toString()
    private val hour = 3_600_000L

    private val dotLifetime = UserPresence.IDLE_WINDOW_MS

    @Test
    fun `an entry whose dot still shows is kept`() {
        val kept = PresenceRetention.retained(mapOf("u1" to UserPresence(false, iso(-dotLifetime))), "me", now)

        assertThat(kept).containsKey("u1")
    }

    @Test
    fun `an entry whose dot is out is dropped - a date the server may withdraw is not kept for the profile line`() {
        val kept = PresenceRetention.retained(
            mapOf("u1" to UserPresence(false, iso(-dotLifetime - 1)), "u2" to UserPresence(false, iso(-3 * hour))),
            "me",
            now,
        )

        assertThat(kept).isEmpty()
    }

    @Test
    fun `what was read back expires when the first of its dots goes out`() {
        val due = PresenceRetention.nextReadBackExpiry(
            mapOf(
                "u1" to UserPresence(false, iso(-4 * 60_000)),
                "u2" to UserPresence(false, iso(-2 * 60_000)),
                "live" to UserPresence(false, iso(-10 * 60_000)),
            ),
            readBack = setOf("u1", "u2"),
        )

        assertThat(due).isEqualTo(now - 4 * 60_000 + dotLifetime + 1)
    }

    @Test
    fun `nothing read back means nothing to expire`() {
        assertThat(PresenceRetention.nextReadBackExpiry(mapOf("u1" to UserPresence(false, iso(0))), emptySet())).isNull()
    }

    @Test
    fun `an entry without a readable date is dropped - nothing to date it, nothing to claim`() {
        val kept = PresenceRetention.retained(
            mapOf("a" to UserPresence(true, null), "b" to UserPresence(false, "n'importe quoi")),
            "me",
            now,
        )

        assertThat(kept).isEmpty()
    }

    @Test
    fun `the current account is never retained`() {
        val kept = PresenceRetention.retained(mapOf("me" to UserPresence(true, iso(0)), "u1" to UserPresence(true, iso(0))), "me", now)

        assertThat(kept.keys).containsExactly("u1")
    }

    @Test
    fun `a blank user id is never retained`() {
        assertThat(PresenceRetention.retained(mapOf(" " to UserPresence(true, iso(0))), "me", now)).isEmpty()
    }

    @Test
    fun `what is read back at launch is no longer online, the date is kept so it decays`() {
        val restored = PresenceRetention.restoredAtLaunch(mapOf("u1" to UserPresence(true, iso(-30_000))), "me", now)

        assertThat(restored["u1"]).isEqualTo(UserPresence(false, iso(-30_000)))
    }

    @Test
    fun `reading back drops what is stale or mine as well`() {
        val restored = PresenceRetention.restoredAtLaunch(
            mapOf(
                "old" to UserPresence(false, iso(-25 * hour)),
                "me" to UserPresence(false, iso(0)),
                "ok" to UserPresence(false, iso(-4 * 60_000)),
                "hour" to UserPresence(false, iso(-hour)),
            ),
            "me",
            now,
        )

        assertThat(restored.keys).containsExactly("ok")
    }

    @Test
    fun `an entry dated in the future beyond the tolerance is never written - a wrong clock is not a presence`() {
        val kept = PresenceRetention.retained(
            mapOf("late" to UserPresence(false, iso(10 * 60_000)), "skew" to UserPresence(false, iso(60_000))),
            "me",
            now,
        )

        assertThat(kept.keys).containsExactly("skew")
    }

    @Test
    fun `an entry dated in the future is never read back as online or recent`() {
        val restored = PresenceRetention.restoredAtLaunch(mapOf("u1" to UserPresence(true, iso(hour))), "me", now)

        assertThat(restored).isEmpty()
    }
}
