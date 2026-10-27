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
        val clock = object : CacheClock {
            override fun nowMillis(): Long = epoch + scope.currentTime
        }
        val store = PresenceStore(
            PresenceSources(userStatus, snapshot, typing, connection),
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

        assertThat(f.store.entries.value["u1"]).isEqualTo(UserPresence(false, iso(epoch)))
    }

    @Test
    fun `my own typing never writes the map`() = runTest {
        val f = fixture()
        f.typing.emit(TypingEvent(conversationId = "c", userId = "me"))
        testScheduler.runCurrent()

        assertThat(f.store.entries.value).isEmpty()
    }

    @Test
    fun `a socket drop keeps lastActiveAt and turns isOnline off, then a snapshot restores`() = runTest {
        val f = fixture()
        f.connection.value = SocketConnectionState.CONNECTED
        f.userStatus.emit(UserStatusEvent("u1", "a", true, iso(epoch - 10_000)))
        testScheduler.runCurrent()

        f.connection.value = SocketConnectionState.CONNECTING
        testScheduler.runCurrent()
        assertThat(f.store.entries.value["u1"]).isEqualTo(UserPresence(false, iso(epoch - 10_000)))

        f.snapshot.emit(PresenceSnapshotEvent(listOf(UserStatusEvent("u1", "a", true, iso(epoch)))))
        testScheduler.runCurrent()
        assertThat(f.store.entries.value["u1"]?.isOnline).isTrue()
    }

    @Test
    fun `an explicit disconnect empties the map`() = runTest {
        val f = fixture()
        f.connection.value = SocketConnectionState.CONNECTED
        f.userStatus.emit(UserStatusEvent("u1", "a", true, iso(epoch)))
        testScheduler.runCurrent()

        f.connection.value = SocketConnectionState.DISCONNECTED
        testScheduler.runCurrent()

        assertThat(f.store.entries.value).isEmpty()
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
}
