package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.PresenceSnapshotEvent
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.TypingEvent
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.UserStatusEvent
import org.junit.Test
import java.time.Instant

/**
 * La carte unique de présence : snapshot gardé en état, frappe qui date sans forcer `isOnline`,
 * coupure du socket, décroissance recalculée par l'horloge partagée avec une horloge injectée.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PresenceStoreTest {

    private val epoch = 1_700_000_000_000L

    private class Fixture(scope: TestScope, epoch: Long) {
        val userStatus = MutableSharedFlow<UserStatusEvent>()
        val snapshot = MutableSharedFlow<PresenceSnapshotEvent>()
        val typing = MutableSharedFlow<TypingEvent>()
        val connection = MutableStateFlow(SocketConnectionState.DISCONNECTED)
        val sessionUser = MutableStateFlow<String?>("me")
        val clock = object : CacheClock {
            override fun nowMillis(): Long = epoch + scope.currentTime
        }
        val store = PresenceStore(
            PresenceSources(userStatus, snapshot, typing, connection, sessionUser),
            clock,
            { "me" },
            StandardTestDispatcher(scope.testScheduler),
        ).also { it.start() }
    }

    private fun TestScope.fixture() = Fixture(this, epoch).also { testScheduler.runCurrent() }
    private fun iso(ms: Long) = Instant.ofEpochMilli(ms).toString()

    @Test
    fun `a screen opened AFTER the snapshot sees it`() = runTest {
        val f = fixture()
        f.snapshot.emit(PresenceSnapshotEvent(listOf(UserStatusEvent("u1", "a", true, iso(epoch)))))
        testScheduler.runCurrent()

        f.store.presenceOf("u1").test {
            assertThat(awaitItem()).isEqualTo(PresenceState.ONLINE)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `an unknown user has no dot, never offline`() = runTest {
        val f = fixture()
        f.store.presenceOf("ghost").test {
            assertThat(awaitItem()).isNull()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `typing dates lastActiveAt and keeps isOnline false`() = runTest {
        val f = fixture()
        f.typing.emit(TypingEvent(conversationId = "c", userId = "u1"))
        testScheduler.runCurrent()

        assertThat(f.store.entriesNow()["u1"]).isEqualTo(UserPresence(false, iso(epoch)))
    }

    @Test
    fun `my own typing never writes the map`() = runTest {
        val f = fixture()
        f.typing.emit(TypingEvent(conversationId = "c", userId = "me"))
        testScheduler.runCurrent()

        assertThat(f.store.entriesNow()).isEmpty()
    }

    @Test
    fun `a socket drop keeps lastActiveAt and turns isOnline off, then a snapshot restores`() = runTest {
        val f = fixture()
        f.connection.value = SocketConnectionState.CONNECTED
        f.userStatus.emit(UserStatusEvent("u1", "a", true, iso(epoch - 10_000)))
        testScheduler.runCurrent()

        f.connection.value = SocketConnectionState.CONNECTING
        testScheduler.runCurrent()
        assertThat(f.store.entriesNow()["u1"]).isEqualTo(UserPresence(false, iso(epoch - 10_000)))

        f.snapshot.emit(PresenceSnapshotEvent(listOf(UserStatusEvent("u1", "a", true, iso(epoch)))))
        testScheduler.runCurrent()
        assertThat(f.store.entriesNow()["u1"]?.isOnline).isTrue()
    }

    @Test
    fun `a disconnect keeps the map and the dot decays instead of vanishing`() = runTest {
        val f = fixture()
        f.connection.value = SocketConnectionState.CONNECTED
        f.userStatus.emit(UserStatusEvent("u1", "a", true, iso(epoch)))
        testScheduler.runCurrent()

        f.store.presenceOf("u1").test {
            assertThat(awaitItem()).isEqualTo(PresenceState.ONLINE)

            f.connection.value = SocketConnectionState.DISCONNECTED
            testScheduler.runCurrent()
            assertThat(f.store.entriesNow()["u1"]).isEqualTo(UserPresence(false, iso(epoch)))
            expectNoEvents()

            testScheduler.advanceTimeBy(61_000)
            assertThat(awaitItem()).isEqualTo(PresenceState.AWAY)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `the snapshot of the reconnection restores what survived a disconnect`() = runTest {
        val f = fixture()
        f.connection.value = SocketConnectionState.CONNECTED
        f.userStatus.emit(UserStatusEvent("u1", "a", true, iso(epoch)))
        testScheduler.runCurrent()
        f.connection.value = SocketConnectionState.DISCONNECTED
        testScheduler.runCurrent()

        f.connection.value = SocketConnectionState.CONNECTED
        f.snapshot.emit(PresenceSnapshotEvent(listOf(UserStatusEvent("u1", "a", true, iso(epoch + 5_000)))))
        testScheduler.runCurrent()

        assertThat(f.store.entriesNow()["u1"]).isEqualTo(UserPresence(true, iso(epoch + 5_000)))
    }

    @Test
    fun `the signed-in account never has a served presence`() = runTest {
        val f = fixture()
        f.snapshot.emit(PresenceSnapshotEvent(listOf(UserStatusEvent("me", "m", true, iso(epoch)), UserStatusEvent("u1", "a", true, iso(epoch)))))
        f.userStatus.emit(UserStatusEvent("me", "m", true, iso(epoch)))
        testScheduler.runCurrent()
        val served = UserPresence(isOnline = true, lastActiveAt = iso(epoch))

        assertThat(f.store.entriesNow().keys).containsExactly("u1")
        f.store.presenceOf("me").test { assertThat(awaitItem()).isNull(); cancelAndIgnoreRemainingEvents() }
        f.store.presenceOf("me", served).test { assertThat(awaitItem()).isNull(); cancelAndIgnoreRemainingEvents() }
        f.store.entryOf("me").test { assertThat(awaitItem()).isNull(); cancelAndIgnoreRemainingEvents() }
        assertThat(f.store.currentStateOf("me", served)).isNull()
        assertThat(f.store.currentStateOf("u1", null)).isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `the dot decays with time on the shared clock and emits only on a state change`() = runTest {
        val f = fixture()
        f.userStatus.emit(UserStatusEvent("u1", "a", false, iso(epoch)))
        testScheduler.runCurrent()

        f.store.presenceOf("u1").test {
            assertThat(awaitItem()).isEqualTo(PresenceState.ONLINE)
            testScheduler.advanceTimeBy(59_000)
            testScheduler.runCurrent()
            expectNoEvents()
            testScheduler.advanceTimeBy(16_000)
            assertThat(awaitItem()).isEqualTo(PresenceState.AWAY)
            testScheduler.advanceTimeBy(120_000)
            assertThat(awaitItem()).isEqualTo(PresenceState.IDLE)
            testScheduler.advanceTimeBy(120_000)
            assertThat(awaitItem()).isEqualTo(PresenceState.OFFLINE)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `switching straight to another account empties the map before its own presence arrives`() = runTest {
        val f = fixture()
        f.connection.value = SocketConnectionState.CONNECTED
        f.userStatus.emit(UserStatusEvent("friendOfMe", "a", true, iso(epoch)))
        testScheduler.runCurrent()

        f.sessionUser.value = "other"
        testScheduler.runCurrent()

        assertThat(f.store.entriesNow()).isEmpty()
    }

    @Test
    fun `a reconnect whose DISCONNECTED is conflated away still clears the previous account`() = runTest {
        val f = fixture()
        f.connection.value = SocketConnectionState.CONNECTED
        f.userStatus.emit(UserStatusEvent("friendOfMe", "a", true, iso(epoch)))
        testScheduler.runCurrent()

        f.connection.value = SocketConnectionState.DISCONNECTED
        f.connection.value = SocketConnectionState.CONNECTING
        f.sessionUser.value = null
        f.sessionUser.value = "other"
        testScheduler.runCurrent()

        assertThat(f.store.entriesNow()).isEmpty()
    }

    @Test
    fun `the restored session of the same account keeps its map`() = runTest {
        val f = fixture()
        f.userStatus.emit(UserStatusEvent("u1", "a", true, iso(epoch)))
        testScheduler.runCurrent()

        f.sessionUser.value = "me"
        testScheduler.runCurrent()

        assertThat(f.store.entriesNow()).containsKey("u1")
    }

    @Test
    fun `the shared clock stops waking a subscriber once its dot is settled offline`() = runTest {
        val f = fixture()
        f.userStatus.emit(UserStatusEvent("u1", "a", false, iso(epoch)))
        testScheduler.runCurrent()

        f.store.presenceOf("u1").test {
            assertThat(awaitItem()).isEqualTo(PresenceState.ONLINE)
            testScheduler.runCurrent()
            assertThat(f.store.isTicking.value).isTrue()
            testScheduler.advanceTimeBy(316_000)
            testScheduler.runCurrent()
            assertThat(expectMostRecentItem()).isEqualTo(PresenceState.OFFLINE)
            assertThat(f.store.isTicking.value).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a dot without an activity date never subscribes to the clock`() = runTest {
        val f = fixture()
        f.userStatus.emit(UserStatusEvent("u1", "a", true, null))
        testScheduler.runCurrent()

        f.store.presenceOf("u1").test {
            assertThat(awaitItem()).isEqualTo(PresenceState.ONLINE)
            testScheduler.runCurrent()
            assertThat(f.store.isTicking.value).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a served presence stands in when the live map has nothing and decays with the clock`() = runTest {
        val f = fixture()
        val served = UserPresence(isOnline = false, lastActiveAt = iso(epoch - 30_000))

        f.store.presenceOf("u1", served).test {
            assertThat(awaitItem()).isEqualTo(PresenceState.ONLINE)
            testScheduler.advanceTimeBy(61_000)
            testScheduler.runCurrent()
            assertThat(expectMostRecentItem()).isEqualTo(PresenceState.AWAY)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `the live map wins over the served presence`() = runTest {
        val f = fixture()
        val served = UserPresence(isOnline = true, lastActiveAt = iso(epoch))
        f.userStatus.emit(UserStatusEvent("u1", "a", false, iso(epoch - 400_000)))
        testScheduler.runCurrent()

        f.store.presenceOf("u1", served).test {
            assertThat(awaitItem()).isEqualTo(PresenceState.OFFLINE)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `nothing served and nothing live is no dot`() = runTest {
        val f = fixture()
        f.store.presenceOf("ghost", null).test {
            assertThat(awaitItem()).isNull()
            cancelAndIgnoreRemainingEvents()
        }
    }
}
