package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.relation.RelationRitualStage
import me.meeshy.sdk.model.socket.SocketEventNames
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Les quatre événements du lien (#13938) atteignent leurs flux typés — iso `RelationSocketEventsTests.swift`. */
@RunWith(RobolectricTestRunner::class)
class RelationSocketEventsManagerTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val scheduler = TestCoroutineScheduler()

    private fun wired(): Pair<RelationSocketEventsManager, Map<String, (Array<Any>) -> Unit>> {
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        val socket: SocketManager = mockk(relaxed = true)
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val router = SocketEventRouter(SocketEventRegistrar { event, callback -> socket.on(event, callback) }, StandardTestDispatcher(scheduler))
        return RelationSocketEventsManager(router, json).also { it.attach() } to handlers
    }

    private fun Map<String, (Array<Any>) -> Unit>.deliver(event: String, payload: String) {
        getValue(event).invoke(arrayOf(JSONObject(payload)))
        scheduler.advanceUntilIdle()
    }

    @Test
    fun `les quatre evenements du lien sont ecoutes, et aucun de baisse`() {
        val (_, handlers) = wired()

        assertThat(handlers.keys).containsAtLeast(
            SocketEventNames.RELATION_LEVEL_RAISED,
            SocketEventNames.RELATION_RITUAL_STARTED,
            SocketEventNames.RELATION_RITUAL_PROGRESS,
            SocketEventNames.RELATION_RITUAL_COMPLETED,
        )
        assertThat(handlers.keys.filter { it.startsWith("relation:") }).hasSize(4)
    }

    @Test
    fun `un niveau monte nomme l'autre personne et son nouveau niveau`() = runTest {
        val (manager, handlers) = wired()
        manager.levelRaised.test {
            handlers.deliver(SocketEventNames.RELATION_LEVEL_RAISED, """{"userId":"u2","level":"CLOSE","at":"2026-11-02T10:00:00Z"}""")
            val event = awaitItem()
            assertThat(event.userId).isEqualTo("u2")
            assertThat(event.raisedTo).isEqualTo(RelationLevel.CLOSE)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `la progression du rituel porte son etat, un etat inconnu se lit absent`() = runTest {
        val (manager, handlers) = wired()
        manager.ritualProgress.test {
            handlers.deliver(SocketEventNames.RELATION_RITUAL_PROGRESS, """{"token":"t","userId":"u2","stage":"held"}""")
            assertThat(awaitItem().servedStage).isEqualTo(RelationRitualStage.HELD)
            handlers.deliver(SocketEventNames.RELATION_RITUAL_PROGRESS, """{"token":"t","userId":"u2","stage":"moonwalk"}""")
            assertThat(awaitItem().servedStage).isNull()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `le rituel ouvert puis scelle atteignent leurs flux`() = runTest {
        val (manager, handlers) = wired()
        manager.ritualStarted.test {
            handlers.deliver(
                SocketEventNames.RELATION_RITUAL_STARTED,
                """{"token":"t","userId":"u2","requestId":"r","expiresAt":"2026-11-02T10:05:00Z","holdWindowMs":15000}""",
            )
            assertThat(awaitItem().holdWindowMs).isEqualTo(15_000L)
            cancelAndIgnoreRemainingEvents()
        }
        manager.ritualCompleted.test {
            handlers.deliver(SocketEventNames.RELATION_RITUAL_COMPLETED, """{"token":"t","userId":"u2","level":"BLOOD"}""")
            assertThat(awaitItem().token).isEqualTo("t")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `l'arret d'un Bring atteint son flux, pour que l'expediteur cesse d'annoncer la sonnerie`() = runTest {
        val (manager, handlers) = wired()
        manager.bringStopped.test {
            handlers.deliver(
                SocketEventNames.BRING_STOPPED,
                """{"bringId":"b1","fromUserId":"me","toUserId":"u2","reason":"recipient","stoppedAt":"2026-11-07T10:00:00Z"}""",
            )
            assertThat(awaitItem().bringId).isEqualTo("b1")
            cancelAndIgnoreRemainingEvents()
        }
    }
}
