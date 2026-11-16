package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityAnnouncementKind
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityEvent
import me.meeshy.sdk.model.phonereachability.PhoneUnreachableCause
import me.meeshy.sdk.model.socket.SocketEventNames
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Les événements descendants du téléphone injoignable (#18737) atteignent leur flux typé, à travers le vrai décodeur. */
@RunWith(RobolectricTestRunner::class)
class PhoneReachabilitySocketEventsManagerTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val scheduler = TestCoroutineScheduler()
    private val alice = "64b7f0c2a1b2c3d4e5f60718"

    private fun wired(): Pair<PhoneReachabilitySocketEventsManager, Map<String, (Array<Any>) -> Unit>> {
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        val socket: SocketManager = mockk(relaxed = true)
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val router = SocketEventRouter(SocketEventRegistrar { event, callback -> socket.on(event, callback) }, StandardTestDispatcher(scheduler))
        return PhoneReachabilitySocketEventsManager(router, json).also { it.attach() } to handlers
    }

    private fun Map<String, (Array<Any>) -> Unit>.deliver(event: String, payload: String) {
        getValue(event).invoke(arrayOf(JSONObject(payload)))
        scheduler.advanceUntilIdle()
    }

    @Test
    fun `les deux evenements descendants sont ecoutes`() {
        val (_, handlers) = wired()
        assertThat(handlers.keys).containsAtLeast(SocketEventNames.PHONE_UNREACHABLE, SocketEventNames.PHONE_REACHABLE)
    }

    @Test
    fun `phone unreachable porte l'etat et l'annonce de la SyncPill`() = runTest {
        val (manager, handlers) = wired()
        manager.events.test {
            handlers.deliver(
                SocketEventNames.PHONE_UNREACHABLE,
                """{"userId":"$alice","state":{"userId":"$alice","unreachableSince":"2026-11-15T14:10:00.000Z","cause":"battery"},
                "announcement":{"kind":"unreachable","at":"2026-11-15T14:30:00.000Z"}}""",
            )
            val event = awaitItem() as PhoneReachabilityEvent.Unreachable
            assertThat(event.state.cause).isEqualTo(PhoneUnreachableCause.BATTERY)
            assertThat(event.announcement?.kind).isEqualTo(PhoneReachabilityAnnouncementKind.UNREACHABLE)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `une charge hors contrat n'atteint pas le flux, la suivante passe`() = runTest {
        val (manager, handlers) = wired()
        manager.events.test {
            handlers.deliver(SocketEventNames.PHONE_UNREACHABLE, """{"userId":"$alice","state":{"userId":"$alice"}}""")
            handlers.deliver(SocketEventNames.PHONE_REACHABLE, """{"userId":"$alice"}""")
            assertThat(awaitItem()).isEqualTo(PhoneReachabilityEvent.Reachable(alice, null))
            cancelAndIgnoreRemainingEvents()
        }
    }
}
