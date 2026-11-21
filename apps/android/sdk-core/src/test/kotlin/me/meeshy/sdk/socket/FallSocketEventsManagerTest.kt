package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.fall.FallClearedReason
import me.meeshy.sdk.model.fall.FallEvent
import me.meeshy.sdk.model.socket.SocketEventNames
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Les événements descendants de la chute détectée (#18748) atteignent leur flux typé, à travers le vrai décodeur. */
@RunWith(RobolectricTestRunner::class)
class FallSocketEventsManagerTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val scheduler = TestCoroutineScheduler()
    private val awa = "64b7f0c2a1b2c3d4e5f60718"

    private fun wired(): Pair<FallSocketEventsManager, Map<String, (Array<Any>) -> Unit>> {
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        val socket: SocketManager = mockk(relaxed = true)
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val router = SocketEventRouter(SocketEventRegistrar { event, callback -> socket.on(event, callback) }, StandardTestDispatcher(scheduler))
        return FallSocketEventsManager(router, json).also { it.attach() } to handlers
    }

    private fun Map<String, (Array<Any>) -> Unit>.deliver(event: String, payload: String) {
        getValue(event).invoke(arrayOf(JSONObject(payload)))
        scheduler.advanceUntilIdle()
    }

    @Test
    fun `les deux evenements descendants sont ecoutes`() {
        val (_, handlers) = wired()
        assertThat(handlers.keys).containsAtLeast(SocketEventNames.FALL_DETECTED, SocketEventNames.FALL_CLEARED)
    }

    @Test
    fun `fall detected porte l'etat, la batterie et l'annonce de la SyncPill`() = runTest {
        val (manager, handlers) = wired()
        manager.events.test {
            handlers.deliver(
                SocketEventNames.FALL_DETECTED,
                """{"userId":"$awa","state":{"userId":"$awa","detectedAt":"2026-11-19T16:42:00.000Z","expiresAt":"2026-11-19T22:42:00.000Z",
                "lastBattery":{"level":41,"measuredAt":"2026-11-19T16:30:00.000Z"}},"announcement":{"kind":"detected","at":"2026-11-19T16:42:00.000Z"}}""",
            )
            val event = awaitItem() as FallEvent.Detected
            assertThat(event.state.lastBattery?.level).isEqualTo(41)
            assertThat(event.announcedAtMillis).isNotNull()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `fall cleared porte sa raison, et une charge hors contrat n'atteint rien`() = runTest {
        val (manager, handlers) = wired()
        manager.events.test {
            handlers.deliver(SocketEventNames.FALL_CLEARED, """{"reason":"responded"}""")
            handlers.deliver(SocketEventNames.FALL_CLEARED, """{"userId":"$awa","reason":"responded"}""")
            assertThat(awaitItem()).isEqualTo(FallEvent.Cleared(awa, FallClearedReason.RESPONDED))
            cancelAndIgnoreRemainingEvents()
        }
    }
}
