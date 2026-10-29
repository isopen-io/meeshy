package me.meeshy.sdk.model.presence

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.UserPresence
import org.junit.Test
import java.time.Instant

/** Ce que la carte de présence garde sur disque : 24 h au plus, jamais le compte courant, jamais une date inventée. */
class PresenceRetentionTest {

    private val now = 1_700_000_000_000L
    private fun iso(offsetMs: Long) = Instant.ofEpochMilli(now + offsetMs).toString()
    private val hour = 3_600_000L

    @Test
    fun `an entry active within 24 hours is kept`() {
        val kept = PresenceRetention.retained(mapOf("u1" to UserPresence(false, iso(-23 * hour))), "me", now)

        assertThat(kept).containsKey("u1")
    }

    @Test
    fun `an entry older than 24 hours is dropped`() {
        val kept = PresenceRetention.retained(mapOf("u1" to UserPresence(false, iso(-24 * hour - 1))), "me", now)

        assertThat(kept).isEmpty()
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
                "ok" to UserPresence(false, iso(-hour)),
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
