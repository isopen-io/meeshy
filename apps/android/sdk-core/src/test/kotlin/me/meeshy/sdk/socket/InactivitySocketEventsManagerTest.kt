package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.inactivity.InactivityAnnouncementKind
import me.meeshy.sdk.model.inactivity.InactivityEvent
import me.meeshy.sdk.model.socket.SocketEventNames
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Les événements descendants de la vérification d'inactivité (#18738) atteignent leur flux typé, à travers le vrai décodeur. */
@RunWith(RobolectricTestRunner::class)
class InactivitySocketEventsManagerTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val scheduler = TestCoroutineScheduler()
    private val jacques = "64b7f0c2a1b2c3d4e5f60718"

    private fun wired(): Pair<InactivitySocketEventsManager, Map<String, (Array<Any>) -> Unit>> {
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        val socket: SocketManager = mockk(relaxed = true)
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val router = SocketEventRouter(SocketEventRegistrar { event, callback -> socket.on(event, callback) }, StandardTestDispatcher(scheduler))
        return InactivitySocketEventsManager(router, json).also { it.attach() } to handlers
    }

    private fun Map<String, (Array<Any>) -> Unit>.deliver(event: String, payload: String) {
        getValue(event).invoke(arrayOf(JSONObject(payload)))
        scheduler.advanceUntilIdle()
    }

    @Test
    fun `les deux evenements descendants sont ecoutes`() {
        val (_, handlers) = wired()
        assertThat(handlers.keys).containsAtLeast(SocketEventNames.INACTIVITY_ALERT, SocketEventNames.INACTIVITY_CLEARED)
    }

    @Test
    fun `inactivity alert porte l'etat, la batterie et l'annonce de la SyncPill`() = runTest {
        val (manager, handlers) = wired()
        manager.events.test {
            handlers.deliver(
                SocketEventNames.INACTIVITY_ALERT,
                """{"userId":"$jacques","state":{"userId":"$jacques","inactiveSince":"2026-11-18T08:00:00.000Z",
                "alertedAt":"2026-11-18T20:30:00.000Z","lastBattery":{"level":9,"measuredAt":"2026-11-18T08:00:00.000Z"}},
                "announcement":{"kind":"alert","inactiveSince":"2026-11-18T08:00:00.000Z","at":"2026-11-18T20:30:00.000Z"}}""",
            )
            val event = awaitItem() as InactivityEvent.Alert
            assertThat(event.state.lastBattery?.level).isEqualTo(9)
            assertThat(event.announcement?.kind).isEqualTo(InactivityAnnouncementKind.ALERT)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `une charge hors contrat n'atteint pas le flux, la suivante passe`() = runTest {
        val (manager, handlers) = wired()
        manager.events.test {
            handlers.deliver(SocketEventNames.INACTIVITY_ALERT, """{"userId":"$jacques","state":{"userId":"$jacques"}}""")
            handlers.deliver(SocketEventNames.INACTIVITY_CLEARED, """{"userId":"$jacques"}""")
            assertThat(awaitItem()).isEqualTo(InactivityEvent.Cleared(jacques, null))
            cancelAndIgnoreRemainingEvents()
        }
    }
}
