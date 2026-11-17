package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.battery.BatteryAnnouncementKind
import me.meeshy.sdk.model.battery.BatteryEvent
import me.meeshy.sdk.model.battery.BatteryPhase
import me.meeshy.sdk.model.socket.SocketEventNames
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Les événements descendants de la batterie (#14147) atteignent leurs flux typés, à travers le vrai décodeur. */
@RunWith(RobolectricTestRunner::class)
class BatterySocketEventsManagerTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val scheduler = TestCoroutineScheduler()
    private val alice = "64b7f0c2a1b2c3d4e5f60718"

    private fun wired(): Pair<BatterySocketEventsManager, Map<String, (Array<Any>) -> Unit>> {
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        val socket: SocketManager = mockk(relaxed = true)
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val router = SocketEventRouter(SocketEventRegistrar { event, callback -> socket.on(event, callback) }, StandardTestDispatcher(scheduler))
        return BatterySocketEventsManager(router, json).also { it.attach() } to handlers
    }

    private fun Map<String, (Array<Any>) -> Unit>.deliver(event: String, payload: String) {
        getValue(event).invoke(arrayOf(JSONObject(payload)))
        scheduler.advanceUntilIdle()
    }

    @Test
    fun `les trois evenements descendants sont ecoutes`() {
        val (_, handlers) = wired()
        assertThat(handlers.keys).containsAtLeast(
            SocketEventNames.BATTERY_CHANGED,
            SocketEventNames.BATTERY_CLEARED,
            SocketEventNames.BATTERY_PULL_REQUESTED,
        )
    }

    @Test
    fun `battery changed porte l'etat et l'annonce de la SyncPill`() = runTest {
        val (manager, handlers) = wired()
        manager.events.test {
            handlers.deliver(
                SocketEventNames.BATTERY_CHANGED,
                """{"userId":"$alice","state":{"userId":"$alice","phase":"critical","level":5,"charging":false,"lowPower":true,
                "measuredAt":"2026-11-15T10:00:00.000Z"},"announcement":{"kind":"critical","level":5,"at":"2026-11-15T10:00:00.000Z"}}""",
            )
            val event = awaitItem() as BatteryEvent.Changed
            assertThat(event.state.phase).isEqualTo(BatteryPhase.CRITICAL)
            assertThat(event.announcement?.kind).isEqualTo(BatteryAnnouncementKind.CRITICAL)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `une charge hors contrat n'atteint pas le flux, la suivante passe`() = runTest {
        val (manager, handlers) = wired()
        manager.events.test {
            handlers.deliver(SocketEventNames.BATTERY_CHANGED, """{"userId":"$alice","state":{"userId":"$alice","phase":"low"}}""")
            handlers.deliver(SocketEventNames.BATTERY_CLEARED, """{"userId":"$alice"}""")
            assertThat(awaitItem()).isEqualTo(BatteryEvent.Cleared(alice, null))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `battery pull requested demande un releve`() = runTest {
        val (manager, handlers) = wired()
        manager.pullRequested.test {
            handlers.deliver(SocketEventNames.BATTERY_PULL_REQUESTED, """{"requestedAt":"2026-11-15T10:00:00.000Z"}""")
            assertThat(awaitItem().requestedAt).isEqualTo("2026-11-15T10:00:00.000Z")
            cancelAndIgnoreRemainingEvents()
        }
    }
}
