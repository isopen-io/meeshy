package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage for [LiveLocationSessions] — the pure reducer that ports iOS
 * `ConversationSocketManager.activeLiveLocations` (the started / updated / stopped
 * handlers maintaining a per-user session map). Covers start / replace, update (existing
 * + unknown no-op + null-clears-motion), stop (present + inert), the expiry-aware
 * `active`, and `pruneExpired` (drops lapsed, same-instance when clean).
 */
class LiveLocationSessionsTest {

    private fun session(
        userId: String,
        expiresAtMillis: Long = 100_000L,
        latitude: Double = 1.0,
        longitude: Double = 2.0,
        speed: Double? = null,
        heading: Double? = null,
    ) = ActiveLiveLocation(
        userId = userId,
        username = userId,
        latitude = latitude,
        longitude = longitude,
        speed = speed,
        heading = heading,
        expiresAtMillis = expiresAtMillis,
        startedAtMillis = 0L,
        lastUpdatedMillis = 0L,
    )

    @Test
    fun empty_hasNoSessions() {
        assertThat(LiveLocationSessions.EMPTY.isEmpty).isTrue()
        assertThat(LiveLocationSessions.EMPTY.sessionFor("u1")).isNull()
    }

    @Test
    fun start_registersASession() {
        val s = LiveLocationSessions.EMPTY.start(session("u1"))
        assertThat(s.isEmpty).isFalse()
        assertThat(s.sessionFor("u1")?.userId).isEqualTo("u1")
    }

    @Test
    fun start_sameUserAgain_replacesTheSession() {
        val first = LiveLocationSessions.EMPTY.start(session("u1", expiresAtMillis = 100_000L))
        val second = first.start(session("u1", expiresAtMillis = 200_000L))
        assertThat(second.sessions).hasSize(1)
        assertThat(second.sessionFor("u1")?.expiresAtMillis).isEqualTo(200_000L)
    }

    @Test
    fun start_differentUsers_keepBothInOrder() {
        val s = LiveLocationSessions.EMPTY.start(session("u1")).start(session("u2"))
        assertThat(s.sessions.keys).containsExactly("u1", "u2").inOrder()
    }

    @Test
    fun update_existingSession_movesThePinAndStamps() {
        val started = LiveLocationSessions.EMPTY.start(session("u1", latitude = 1.0, longitude = 2.0))
        val moved = started.update(
            userId = "u1",
            latitude = 10.0,
            longitude = 20.0,
            atMillis = 5_000L,
            speed = 3.0,
            heading = 45.0,
        )
        val s = moved.sessionFor("u1")!!
        assertThat(s.latitude).isEqualTo(10.0)
        assertThat(s.longitude).isEqualTo(20.0)
        assertThat(s.speed).isEqualTo(3.0)
        assertThat(s.heading).isEqualTo(45.0)
        assertThat(s.lastUpdatedMillis).isEqualTo(5_000L)
    }

    @Test
    fun update_keepsTheDeadline() {
        val started = LiveLocationSessions.EMPTY.start(session("u1", expiresAtMillis = 100_000L))
        val moved = started.update(userId = "u1", latitude = 9.0, longitude = 9.0, atMillis = 5_000L)
        assertThat(moved.sessionFor("u1")?.expiresAtMillis).isEqualTo(100_000L)
    }

    @Test
    fun update_nullMotion_clearsThePreviousVector() {
        val started = LiveLocationSessions.EMPTY.start(session("u1", speed = 7.0, heading = 12.0))
        val moved = started.update(userId = "u1", latitude = 1.0, longitude = 1.0, atMillis = 1_000L)
        assertThat(moved.sessionFor("u1")?.speed).isNull()
        assertThat(moved.sessionFor("u1")?.heading).isNull()
    }

    @Test
    fun update_unknownUser_isInertSameInstance() {
        val started = LiveLocationSessions.EMPTY.start(session("u1"))
        val after = started.update(userId = "ghost", latitude = 0.0, longitude = 0.0, atMillis = 1L)
        assertThat(after).isSameInstanceAs(started)
    }

    @Test
    fun stop_removesTheSession() {
        val started = LiveLocationSessions.EMPTY.start(session("u1")).start(session("u2"))
        val after = started.stop("u1")
        assertThat(after.sessionFor("u1")).isNull()
        assertThat(after.sessionFor("u2")).isNotNull()
    }

    @Test
    fun stop_unknownUser_isInertSameInstance() {
        val started = LiveLocationSessions.EMPTY.start(session("u1"))
        val after = started.stop("ghost")
        assertThat(after).isSameInstanceAs(started)
    }

    @Test
    fun active_excludesExpiredSessions() {
        val s = LiveLocationSessions.EMPTY
            .start(session("live", expiresAtMillis = 100_000L))
            .start(session("dead", expiresAtMillis = 10_000L))
        val active = s.active(nowEpochMillis = 50_000L)
        assertThat(active.map { it.userId }).containsExactly("live")
    }

    @Test
    fun active_allLive_returnsEveryoneInOrder() {
        val s = LiveLocationSessions.EMPTY
            .start(session("u1", expiresAtMillis = 100_000L))
            .start(session("u2", expiresAtMillis = 100_000L))
        assertThat(s.active(nowEpochMillis = 1_000L).map { it.userId })
            .containsExactly("u1", "u2").inOrder()
    }

    @Test
    fun pruneExpired_dropsLapsedSessions() {
        val s = LiveLocationSessions.EMPTY
            .start(session("live", expiresAtMillis = 100_000L))
            .start(session("dead", expiresAtMillis = 10_000L))
        val pruned = s.pruneExpired(nowEpochMillis = 50_000L)
        assertThat(pruned.sessions.keys).containsExactly("live")
    }

    @Test
    fun pruneExpired_nothingExpired_isSameInstance() {
        val s = LiveLocationSessions.EMPTY
            .start(session("u1", expiresAtMillis = 100_000L))
            .start(session("u2", expiresAtMillis = 100_000L))
        assertThat(s.pruneExpired(nowEpochMillis = 1_000L)).isSameInstanceAs(s)
    }
}
