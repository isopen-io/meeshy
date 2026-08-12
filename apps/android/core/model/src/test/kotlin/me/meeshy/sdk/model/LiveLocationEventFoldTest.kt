package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage for [LiveLocationEventFold] — the pure mapper that folds the
 * `location:live-started` / `location:live-updated` / `location:live-stopped` wire
 * events into the [LiveLocationSessions] reducer (port of the three
 * `ConversationSocketHandler` sinks). Pins the iOS fallbacks — `expiresAt ?? now +
 * durationMinutes·60` and `startedAt ?? now` for `started`, `timestamp ?? now` for
 * `updated` — with the ISO parse resolved through the shared [isoToEpochMillisOrNull],
 * and confirms the reducer's own inert/no-op contracts survive the fold.
 */
class LiveLocationEventFoldTest {

    // `now` is deliberately distinct from the parsed `startedAt` below, so the
    // `expiresAt ?? now + window` fallback is observably anchored on `now` (not `startedAt`).
    private val now = 1_700_000_600_000L // startMillis + 10 min
    private val startIso = "2023-11-14T22:13:20Z" // == 1_700_000_000_000 ms
    private val startMillis = 1_700_000_000_000L

    // --- started -------------------------------------------------------------

    @Test
    fun started_uses_the_server_timestamps_when_present() {
        val event = LiveLocationStartedEvent(
            conversationId = "c1",
            userId = "u1",
            username = "Ada",
            latitude = 48.85,
            longitude = 2.35,
            durationMinutes = 30,
            expiresAt = "2023-11-14T22:43:20Z", // start + 30 min
            startedAt = startIso,
        )

        val session = LiveLocationEventFold.started(LiveLocationSessions.EMPTY, event, now)
            .sessionFor("u1")

        assertThat(session).isNotNull()
        assertThat(session!!.startedAtMillis).isEqualTo(startMillis)
        assertThat(session.expiresAtMillis).isEqualTo(startMillis + 30 * 60_000L)
        assertThat(session.username).isEqualTo("Ada")
        assertThat(session.latitude).isEqualTo(48.85)
        assertThat(session.longitude).isEqualTo(2.35)
    }

    @Test
    fun started_falls_back_to_now_plus_duration_when_expires_at_is_absent() {
        val event = LiveLocationStartedEvent(
            conversationId = "c1",
            userId = "u1",
            username = "Ada",
            durationMinutes = 15,
            expiresAt = null,
            startedAt = startIso,
        )

        val session = LiveLocationEventFold.started(LiveLocationSessions.EMPTY, event, now)
            .sessionFor("u1")!!

        assertThat(session.expiresAtMillis).isEqualTo(now + 15 * 60_000L)
        assertThat(session.startedAtMillis).isEqualTo(startMillis)
    }

    @Test
    fun started_falls_back_to_now_when_started_at_is_absent() {
        val event = LiveLocationStartedEvent(
            conversationId = "c1",
            userId = "u1",
            username = "Ada",
            durationMinutes = 60,
            expiresAt = null,
            startedAt = null,
        )

        val session = LiveLocationEventFold.started(LiveLocationSessions.EMPTY, event, now)
            .sessionFor("u1")!!

        assertThat(session.startedAtMillis).isEqualTo(now)
        assertThat(session.lastUpdatedMillis).isEqualTo(now)
        assertThat(session.expiresAtMillis).isEqualTo(now + 60 * 60_000L)
    }

    @Test
    fun started_with_a_zero_duration_and_no_expiry_collapses_to_an_already_expired_session() {
        val event = LiveLocationStartedEvent(
            conversationId = "c1",
            userId = "u1",
            username = "Ada",
            durationMinutes = 0,
            expiresAt = null,
            startedAt = null,
        )

        val session = LiveLocationEventFold.started(LiveLocationSessions.EMPTY, event, now)
            .sessionFor("u1")!!

        assertThat(session.expiresAtMillis).isEqualTo(now)
        assertThat(session.isExpired(now)).isTrue()
    }

    @Test
    fun started_with_a_negative_duration_and_no_expiry_never_grants_time_past_now() {
        val event = LiveLocationStartedEvent(
            conversationId = "c1",
            userId = "u1",
            username = "Ada",
            durationMinutes = -120,
            expiresAt = null,
            startedAt = null,
        )

        val session = LiveLocationEventFold.started(LiveLocationSessions.EMPTY, event, now)
            .sessionFor("u1")!!

        assertThat(session.expiresAtMillis).isEqualTo(now)
    }

    @Test
    fun started_replaces_an_existing_session_for_the_same_user() {
        val first = LiveLocationStartedEvent(userId = "u1", username = "Ada", latitude = 1.0, durationMinutes = 30)
        val second = LiveLocationStartedEvent(userId = "u1", username = "Ada", latitude = 9.0, durationMinutes = 30)

        val after = LiveLocationEventFold.started(
            LiveLocationEventFold.started(LiveLocationSessions.EMPTY, first, now),
            second,
            now,
        )

        assertThat(after.sessions).hasSize(1)
        assertThat(after.sessionFor("u1")!!.latitude).isEqualTo(9.0)
    }

    // --- updated -------------------------------------------------------------

    @Test
    fun updated_moves_an_existing_session_and_stamps_the_server_timestamp() {
        val started = LiveLocationEventFold.started(
            LiveLocationSessions.EMPTY,
            LiveLocationStartedEvent(userId = "u1", username = "Ada", latitude = 1.0, longitude = 1.0, durationMinutes = 30),
            now,
        )
        val event = LiveLocationUpdatedEvent(
            userId = "u1",
            latitude = 2.0,
            longitude = 3.0,
            speed = 5.5,
            heading = 90.0,
            timestamp = "2023-11-14T22:20:00Z",
        )

        val moved = LiveLocationEventFold.updated(started, event, now).sessionFor("u1")!!

        assertThat(moved.latitude).isEqualTo(2.0)
        assertThat(moved.longitude).isEqualTo(3.0)
        assertThat(moved.speed).isEqualTo(5.5)
        assertThat(moved.heading).isEqualTo(90.0)
        assertThat(moved.lastUpdatedMillis).isEqualTo(1_700_000_400_000L)
    }

    @Test
    fun updated_stamps_now_when_the_timestamp_is_absent() {
        val started = LiveLocationEventFold.started(
            LiveLocationSessions.EMPTY,
            LiveLocationStartedEvent(userId = "u1", username = "Ada", durationMinutes = 30),
            now,
        )
        val event = LiveLocationUpdatedEvent(userId = "u1", latitude = 2.0, longitude = 3.0, timestamp = null)

        val moved = LiveLocationEventFold.updated(started, event, now).sessionFor("u1")!!

        assertThat(moved.lastUpdatedMillis).isEqualTo(now)
    }

    @Test
    fun updated_does_not_extend_the_deadline() {
        val started = LiveLocationEventFold.started(
            LiveLocationSessions.EMPTY,
            LiveLocationStartedEvent(userId = "u1", username = "Ada", durationMinutes = 30, startedAt = startIso, expiresAt = null),
            now,
        )
        val deadlineBefore = started.sessionFor("u1")!!.expiresAtMillis
        val event = LiveLocationUpdatedEvent(userId = "u1", latitude = 2.0, longitude = 3.0, timestamp = "2099-01-01T00:00:00Z")

        val moved = LiveLocationEventFold.updated(started, event, now).sessionFor("u1")!!

        assertThat(moved.expiresAtMillis).isEqualTo(deadlineBefore)
    }

    @Test
    fun updated_is_an_inert_no_op_for_an_unknown_user() {
        val event = LiveLocationUpdatedEvent(userId = "ghost", latitude = 2.0, longitude = 3.0)

        val after = LiveLocationEventFold.updated(LiveLocationSessions.EMPTY, event, now)

        assertThat(after).isSameInstanceAs(LiveLocationSessions.EMPTY)
    }

    @Test
    fun updated_with_null_motion_clears_the_previous_vector() {
        val started = LiveLocationEventFold.started(
            LiveLocationSessions.EMPTY,
            LiveLocationStartedEvent(userId = "u1", username = "Ada", durationMinutes = 30),
            now,
        )
        val withMotion = LiveLocationEventFold.updated(
            started,
            LiveLocationUpdatedEvent(userId = "u1", latitude = 2.0, longitude = 3.0, speed = 4.0, heading = 8.0),
            now,
        )

        val cleared = LiveLocationEventFold.updated(
            withMotion,
            LiveLocationUpdatedEvent(userId = "u1", latitude = 2.0, longitude = 3.0, speed = null, heading = null),
            now,
        ).sessionFor("u1")!!

        assertThat(cleared.speed).isNull()
        assertThat(cleared.heading).isNull()
    }

    // --- stopped -------------------------------------------------------------

    @Test
    fun stopped_removes_the_session() {
        val started = LiveLocationEventFold.started(
            LiveLocationSessions.EMPTY,
            LiveLocationStartedEvent(userId = "u1", username = "Ada", durationMinutes = 30),
            now,
        )

        val after = LiveLocationEventFold.stopped(started, LiveLocationStoppedEvent(userId = "u1"))

        assertThat(after.isEmpty).isTrue()
    }

    @Test
    fun stopped_is_an_inert_no_op_for_an_unknown_user() {
        val after = LiveLocationEventFold.stopped(LiveLocationSessions.EMPTY, LiveLocationStoppedEvent(userId = "ghost"))

        assertThat(after).isSameInstanceAs(LiveLocationSessions.EMPTY)
    }
}
