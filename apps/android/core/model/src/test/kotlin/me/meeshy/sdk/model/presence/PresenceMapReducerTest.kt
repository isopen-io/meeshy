package me.meeshy.sdk.model.presence

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.UserStatusEvent
import org.junit.Test
import java.time.Instant

class PresenceMapReducerTest {

    private val now = 1_700_000_000_000L
    private fun iso(offsetMs: Long) = Instant.ofEpochMilli(now + offsetMs).toString()
    private fun status(id: String, online: Boolean, last: String? = null) =
        UserStatusEvent(userId = id, isOnline = online, lastActiveAt = last)

    @Test
    fun `user status replaces the entry of its user and keeps the others`() {
        val before: PresenceMap = mapOf("a" to UserPresence(true, iso(-1000)), "b" to UserPresence(false, null))
        val after = PresenceMapReducer.applyStatus(before, status("a", false, iso(-500)))

        assertThat(after["a"]).isEqualTo(UserPresence(false, iso(-500)))
        assertThat(after["b"]).isEqualTo(before["b"])
    }

    @Test
    fun `an identical status leaves the very same map instance`() {
        val before: PresenceMap = mapOf("a" to UserPresence(true, iso(0)))
        assertThat(PresenceMapReducer.applyStatus(before, status("a", true, iso(0)))).isSameInstanceAs(before)
    }

    @Test
    fun `a snapshot replaces stale rows, keeps absent users and the last duplicate wins`() {
        val before: PresenceMap = mapOf("a" to UserPresence(true, iso(-9000)), "z" to UserPresence(true, iso(-100)))
        val after = PresenceMapReducer.applySnapshot(
            before,
            listOf(status("a", true, iso(-5)), status("a", false, iso(-4)), status("b", true, iso(0))),
        )

        assertThat(after["a"]).isEqualTo(UserPresence(false, iso(-4)))
        assertThat(after["b"]?.isOnline).isTrue()
        assertThat(after["z"]).isEqualTo(before["z"])
    }

    @Test
    fun `an empty snapshot changes nothing`() {
        val before: PresenceMap = mapOf("a" to UserPresence(true, iso(0)))
        assertThat(PresenceMapReducer.applySnapshot(before, emptyList())).isSameInstanceAs(before)
    }

    @Test
    fun `activity dates lastActiveAt without forcing isOnline`() {
        val after = PresenceMapReducer.noteActivity(emptyMap(), "u1", currentUserId = "me", nowMillis = now)

        assertThat(after["u1"]).isEqualTo(UserPresence(isOnline = false, lastActiveAt = iso(0)))
    }

    @Test
    fun `activity keeps the isOnline the server last said`() {
        val before: PresenceMap = mapOf("u1" to UserPresence(true, iso(-200_000)))
        val after = PresenceMapReducer.noteActivity(before, "u1", "me", now)

        assertThat(after["u1"]).isEqualTo(UserPresence(true, iso(0)))
    }

    @Test
    fun `my own activity and a blank id never write the map`() {
        val empty: PresenceMap = emptyMap()
        assertThat(PresenceMapReducer.noteActivity(empty, "me", "me", now)).isSameInstanceAs(empty)
        assertThat(PresenceMapReducer.noteActivity(empty, "", "me", now)).isSameInstanceAs(empty)
    }

    @Test
    fun `a typer who is offline decays green then orange then grey then nothing`() {
        val map = PresenceMapReducer.noteActivity(emptyMap(), "u1", "me", now)
        val presence = map.getValue("u1")

        assertThat(presence.state(now + 59_000)).isEqualTo(PresenceState.ONLINE)
        assertThat(presence.state(now + UserPresence.ONLINE_WINDOW_MS + 1)).isEqualTo(PresenceState.AWAY)
        assertThat(presence.state(now + UserPresence.AWAY_WINDOW_MS + 1)).isEqualTo(PresenceState.IDLE)
        assertThat(presence.state(now + UserPresence.IDLE_WINDOW_MS + 1)).isEqualTo(PresenceState.OFFLINE)
    }

    @Test
    fun `a socket cut turns everyone offline and keeps lastActiveAt`() {
        val before: PresenceMap = mapOf("a" to UserPresence(true, iso(-10)), "b" to UserPresence(false, iso(-99)))
        val after = PresenceMapReducer.socketDisconnected(before)

        assertThat(after["a"]).isEqualTo(UserPresence(false, iso(-10)))
        assertThat(after["b"]).isEqualTo(before["b"])
    }

    @Test
    fun `a socket cut with nobody online leaves the same instance`() {
        val before: PresenceMap = mapOf("b" to UserPresence(false, iso(-99)))
        assertThat(PresenceMapReducer.socketDisconnected(before)).isSameInstanceAs(before)
    }

    @Test
    fun `an absent entry derives no state, never offline`() {
        assertThat(PresenceDecayClock.derive(null, now)).isNull()
        assertThat(PresenceDecayClock.derive(UserPresence(true, iso(0)), now)).isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `a served page seeds the users nobody knows yet`() {
        val after = PresenceMapReducer.seed(emptyMap(), mapOf("u1" to UserPresence(true, iso(-1000))), "me")

        assertThat(after["u1"]).isEqualTo(UserPresence(true, iso(-1000)))
    }

    @Test
    fun `a served page never replaces an entry the socket already gave`() {
        val live: PresenceMap = mapOf("u1" to UserPresence(false, iso(-10)))
        val after = PresenceMapReducer.seed(live, mapOf("u1" to UserPresence(true, iso(-5000))), "me")

        assertThat(after).isSameInstanceAs(live)
    }

    @Test
    fun `a served page never writes the current account nor a blank id`() {
        val empty: PresenceMap = emptyMap()
        val after = PresenceMapReducer.seed(empty, mapOf("me" to UserPresence(true, iso(0)), " " to UserPresence(true, iso(0))), "me")

        assertThat(after).isSameInstanceAs(empty)
    }

    @Test
    fun `what was read back fills the unknown and yields to the live entries`() {
        val live: PresenceMap = mapOf("a" to UserPresence(true, iso(0)))
        val after = PresenceMapReducer.restore(live, mapOf("a" to UserPresence(false, iso(-9000)), "b" to UserPresence(false, iso(-9000))))

        assertThat(after["a"]).isEqualTo(UserPresence(true, iso(0)))
        assertThat(after["b"]).isEqualTo(UserPresence(false, iso(-9000)))
    }

    @Test
    fun `a served page replaces what was only read back from the disk`() {
        val map: PresenceMap = mapOf("u1" to UserPresence(false, iso(-60_000)))
        val after = PresenceMapReducer.seed(map, setOf("u1"), ServedPresencePage(served = mapOf("u1" to UserPresence(false, iso(-600_000)))), "me")

        assertThat(after.entries["u1"]).isEqualTo(UserPresence(false, iso(-600_000)))
        assertThat(after.restored).isEmpty()
    }

    @Test
    fun `a masked row of the page withdraws what was only read back from the disk`() {
        val map: PresenceMap = mapOf("u1" to UserPresence(false, iso(-60_000)), "u2" to UserPresence(false, iso(-60_000)))
        val after = PresenceMapReducer.seed(map, setOf("u1", "u2"), ServedPresencePage(masked = setOf("u1")), "me")

        assertThat(after.entries.keys).containsExactly("u2")
        assertThat(after.restored).containsExactly("u2")
    }

    @Test
    fun `a masked row never withdraws a live entry, and a page never replaces one`() {
        val live: PresenceMap = mapOf("u1" to UserPresence(true, iso(0)), "u2" to UserPresence(false, iso(-10)))
        val after = PresenceMapReducer.seed(
            live,
            emptySet(),
            ServedPresencePage(served = mapOf("u2" to UserPresence(true, iso(-5000))), masked = setOf("u1")),
            "me",
        )

        assertThat(after.entries).isSameInstanceAs(live)
    }

    @Test
    fun `a read back never reinjects a user a page already masked`() {
        val after = PresenceMapReducer.restore(
            emptyMap(),
            mapOf("u1" to UserPresence(false, iso(-60_000)), "u2" to UserPresence(false, iso(-60_000))),
            withheld = setOf("u1"),
        )

        assertThat(after.keys).containsExactly("u2")
    }

    @Test
    fun `what was only read back leaves the map when its dot goes out, a live entry stays`() {
        val map: PresenceMap = mapOf(
            "old" to UserPresence(false, iso(-UserPresence.IDLE_WINDOW_MS - 1)),
            "young" to UserPresence(false, iso(-60_000)),
            "live" to UserPresence(false, iso(-3_600_000)),
        )

        val after = PresenceMapReducer.expireReadBack(map, readBack = setOf("old", "young"), nowMillis = now)

        assertThat(after.entries.keys).containsExactly("young", "live")
        assertThat(after.restored).containsExactly("young")
    }

    @Test
    fun `an expiry that removes nothing gives back the same map`() {
        val map: PresenceMap = mapOf("young" to UserPresence(false, iso(-60_000)))

        assertThat(PresenceMapReducer.expireReadBack(map, setOf("young"), now).entries).isSameInstanceAs(map)
    }
}
