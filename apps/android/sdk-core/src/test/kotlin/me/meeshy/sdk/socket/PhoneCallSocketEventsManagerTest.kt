package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.phonecall.PhoneCallAnnouncementKind
import me.meeshy.sdk.model.phonecall.PhoneCallEvent
import me.meeshy.sdk.model.socket.SocketEventNames
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Les événements descendants d'« en appel » (#18753) atteignent leur flux typé, à travers le vrai décodeur. */
@RunWith(RobolectricTestRunner::class)
class PhoneCallSocketEventsManagerTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val scheduler = TestCoroutineScheduler()
    private val jacques = "64b7f0c2a1b2c3d4e5f60718"

    private fun wired(): Pair<PhoneCallSocketEventsManager, Map<String, (Array<Any>) -> Unit>> {
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        val socket: SocketManager = mockk(relaxed = true)
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val router = SocketEventRouter(SocketEventRegistrar { event, callback -> socket.on(event, callback) }, StandardTestDispatcher(scheduler))
        return PhoneCallSocketEventsManager(router, json).also { it.attach() } to handlers
    }

    private fun Map<String, (Array<Any>) -> Unit>.deliver(event: String, payload: String) {
        getValue(event).invoke(arrayOf(JSONObject(payload)))
        scheduler.advanceUntilIdle()
    }

    @Test
    fun `les deux evenements descendants sont ecoutes`() {
        val (_, handlers) = wired()
        assertThat(handlers.keys).containsAtLeast(SocketEventNames.PHONE_CALL_STARTED, SocketEventNames.PHONE_CALL_ENDED)
    }

    @Test
    fun `phone-call started porte l'etat, son expiration et l'annonce de la SyncPill`() = runTest {
        val (manager, handlers) = wired()
        manager.events.test {
            handlers.deliver(
                SocketEventNames.PHONE_CALL_STARTED,
                """{"userId":"$jacques","state":{"userId":"$jacques","since":"2026-11-19T14:00:00.000Z",
                "expiresAt":"2026-11-19T17:02:00.000Z"},"announcement":{"kind":"started","at":"2026-11-19T14:02:13.000Z"}}""",
            )
            val event = awaitItem() as PhoneCallEvent.Started
            assertThat(event.state.userId).isEqualTo(jacques)
            assertThat(event.announcement?.kind).isEqualTo(PhoneCallAnnouncementKind.STARTED)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `une charge hors contrat n'atteint pas le flux, la suivante passe`() = runTest {
        val (manager, handlers) = wired()
        manager.events.test {
            handlers.deliver(SocketEventNames.PHONE_CALL_STARTED, """{"userId":"$jacques","state":{"userId":"$jacques"}}""")
            handlers.deliver(SocketEventNames.PHONE_CALL_ENDED, """{"userId":"$jacques"}""")
            assertThat(awaitItem()).isEqualTo(PhoneCallEvent.Ended(jacques, null))
            cancelAndIgnoreRemainingEvents()
        }
    }
}
