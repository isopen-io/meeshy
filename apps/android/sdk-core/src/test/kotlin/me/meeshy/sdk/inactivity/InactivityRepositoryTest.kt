package me.meeshy.sdk.inactivity

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.inactivity.InactivityAlertState
import me.meeshy.sdk.model.inactivity.InactivityAnnouncement
import me.meeshy.sdk.model.inactivity.InactivityAnnouncementKind
import me.meeshy.sdk.model.inactivity.InactivityEvent
import me.meeshy.sdk.model.inactivity.InactivityLastBattery
import me.meeshy.sdk.model.inactivity.InactivityRoster
import me.meeshy.sdk.model.inactivity.InactivityRosterSnapshot
import org.junit.Test

/** Le magasin des alertes d'inactivité (#18738) : socket, rattrapage à la connexion, compte, cache. */
class InactivityRepositoryTest {

    private class MemoryCache(var stored: InactivityRosterSnapshot? = null) : InactivityRosterCache {
        override fun read(): InactivityRosterSnapshot? = stored

        override fun write(snapshot: InactivityRosterSnapshot?) {
            stored = snapshot
        }
    }

    private class Harness(scope: TestScope, val cache: MemoryCache = MemoryCache(), val now: Long = 20L) {
        val events = MutableSharedFlow<InactivityEvent>(extraBufferCapacity = 8)
        val connected = MutableStateFlow(false)
        var viewer: String? = "me"
        var snapshot: suspend () -> List<InactivityAlertState>? = { emptyList() }
        val repository = InactivityRepository(
            InactivitySources(
                events = events,
                connected = connected,
                snapshot = { snapshot() },
                viewerId = { viewer },
                cache = cache,
                now = { now },
            ),
            StandardTestDispatcher(scope.testScheduler),
        )
    }

    private fun state(userId: String = "u2", since: Long = 10L, battery: InactivityLastBattery? = null) =
        InactivityAlertState(userId, since, since + 1, lastBattery = battery)

    private val alert = InactivityAnnouncement(InactivityAnnouncementKind.ALERT, 10L, 11L)

    @Test
    fun `une alerte recue s'affiche et cleared l'efface`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()
        h.events.emit(InactivityEvent.Alert(state(battery = InactivityLastBattery(9, 10L)), null))
        testScheduler.runCurrent()
        assertThat(h.repository.roster.value.stateOf("u2")?.lastBattery?.level).isEqualTo(9)

        h.events.emit(InactivityEvent.Cleared("u2", null))
        testScheduler.runCurrent()
        assertThat(h.repository.roster.value.stateOf("u2")).isNull()
    }

    @Test
    fun `seule une annonce servie atteint la pastille, jamais la mienne`() = runTest {
        val h = Harness(this)
        val seen = mutableListOf<InactivityNotice>()
        val job = launch { h.repository.notices.collect { seen += it } }
        testScheduler.runCurrent()
        h.events.emit(InactivityEvent.Alert(state(), null))
        h.events.emit(InactivityEvent.Alert(state(since = 11L), alert))
        h.events.emit(InactivityEvent.Alert(state(userId = "me"), alert))
        testScheduler.runCurrent()
        assertThat(seen).containsExactly(InactivityNotice("u2", alert))
        job.cancel()
    }

    @Test
    fun `la connexion rattrape, sans ressusciter ce qu'un retour a efface entre-temps`() = runTest {
        val h = Harness(this)
        val gate = CompletableDeferred<List<InactivityAlertState>>()
        h.snapshot = { gate.await() }
        testScheduler.runCurrent()
        h.connected.value = true
        testScheduler.runCurrent()

        h.events.emit(InactivityEvent.Cleared("u2", null))
        testScheduler.runCurrent()
        gate.complete(listOf(state("u2"), state("u3")))
        testScheduler.runCurrent()

        assertThat(h.repository.roster.value.byUser.keys).containsExactly("u3")
    }

    @Test
    fun `un rattrapage servi a un autre compte est jete`() = runTest {
        val h = Harness(this)
        h.snapshot = { h.viewer = "other"; listOf(state()) }
        h.repository.catchUp()
        assertThat(h.repository.roster.value.byUser).isEmpty()
    }

    @Test
    fun `au demarrage a froid, l'etat range du meme compte se peint avant toute socket`() = runTest {
        val h = Harness(this, MemoryCache(InactivityRosterSnapshot.of("me", InactivityRoster().receive(state()))))
        assertThat(h.repository.roster.value.stateOf("u2")).isNotNull()
        val foreign = Harness(this, MemoryCache(InactivityRosterSnapshot.of("other", InactivityRoster().receive(state()))))
        assertThat(foreign.repository.roster.value.byUser).isEmpty()
    }

    @Test
    fun `chaque etat servi se range, cleared le retire et le changement de compte vide tout`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()
        h.events.emit(InactivityEvent.Alert(state(), null))
        testScheduler.runCurrent()
        assertThat(h.cache.stored?.restore("me", 20L)?.stateOf("u2")).isNotNull()

        h.events.emit(InactivityEvent.Cleared("u2", null))
        testScheduler.runCurrent()
        assertThat(h.cache.stored?.restore("me", 20L)?.byUser.orEmpty()).isEmpty()

        h.events.emit(InactivityEvent.Alert(state(userId = "u3"), null))
        testScheduler.runCurrent()
        h.repository.clear()
        testScheduler.runCurrent()
        assertThat(h.repository.roster.value.byUser).isEmpty()
        assertThat(h.cache.stored?.restore("me", 20L)?.byUser.orEmpty()).isEmpty()
    }
}
