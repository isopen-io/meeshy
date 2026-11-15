package me.meeshy.sdk.battery

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.battery.BatteryAnnouncement
import me.meeshy.sdk.model.battery.BatteryAnnouncementKind
import me.meeshy.sdk.model.battery.BatteryEvent
import me.meeshy.sdk.model.battery.BatteryPhase
import me.meeshy.sdk.model.battery.BatteryRoster
import me.meeshy.sdk.model.battery.BatteryRosterSnapshot
import me.meeshy.sdk.model.battery.BatteryState
import org.junit.Test

/** Le magasin de la batterie des Proches (#14147) : socket, rattrapage à la connexion, relecture, compte. */
class BatteryRepositoryTest {

    private class MemoryCache(var stored: BatteryRosterSnapshot? = null) : BatteryRosterCache {
        override fun read(): BatteryRosterSnapshot? = stored

        override fun write(snapshot: BatteryRosterSnapshot?) {
            stored = snapshot
        }
    }

    private class Harness(scope: TestScope, val cache: MemoryCache = MemoryCache(), val now: Long = 20L) {
        val events = MutableSharedFlow<BatteryEvent>(extraBufferCapacity = 8)
        val connected = MutableStateFlow(false)
        var viewer: String? = "me"
        var snapshot: suspend () -> List<BatteryState>? = { emptyList() }
        var fetch: suspend (String) -> BatteryFetch = { BatteryFetch.Unavailable }
        val repository = BatteryRepository(
            BatterySources(
                events = events,
                connected = connected,
                snapshot = { snapshot() },
                fetch = { fetch(it) },
                viewerId = { viewer },
                cache = cache,
                now = { now },
            ),
            StandardTestDispatcher(scope.testScheduler),
        )
    }

    private fun state(userId: String = "u2", level: Int = 18, at: Long = 10L) =
        BatteryState(userId, BatteryPhase.LOW, level, charging = false, lowPower = false, estimatedMinutes = null, measuredAtMillis = at, deviceLabel = null)

    private val announcement = BatteryAnnouncement(BatteryAnnouncementKind.LOW, 18, null, 10L)

    @Test
    fun `un etat recu s'affiche et cleared l'efface`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()
        h.events.emit(BatteryEvent.Changed(state(), null))
        testScheduler.runCurrent()
        assertThat(h.repository.roster.value.stateOf("u2")?.level).isEqualTo(18)

        h.events.emit(BatteryEvent.Cleared("u2", null))
        testScheduler.runCurrent()
        assertThat(h.repository.roster.value.stateOf("u2")).isNull()
    }

    @Test
    fun `seule une annonce servie atteint la pastille`() = runTest {
        val h = Harness(this)
        val seen = mutableListOf<BatteryNotice>()
        val job = launch { h.repository.notices.collect { seen += it } }
        testScheduler.runCurrent()
        h.events.emit(BatteryEvent.Changed(state(), null))
        h.events.emit(BatteryEvent.Changed(state(at = 11L), announcement))
        testScheduler.runCurrent()
        assertThat(seen).containsExactly(BatteryNotice("u2", announcement))
        job.cancel()
    }

    @Test
    fun `la connexion rattrape, sans ressusciter ce qu'un evenement a efface entre-temps`() = runTest {
        val h = Harness(this)
        val gate = CompletableDeferred<List<BatteryState>>()
        h.snapshot = { gate.await() }
        testScheduler.runCurrent()
        h.connected.value = true
        testScheduler.runCurrent()

        h.events.emit(BatteryEvent.Cleared("u2", null))
        testScheduler.runCurrent()
        gate.complete(listOf(state("u2"), state("u3")))
        testScheduler.runCurrent()

        assertThat(h.repository.roster.value.byUser.keys).containsExactly("u3")
    }

    @Test
    fun `une relecture pose l'etat servi, nul l'efface, une panne ne change rien`() = runTest {
        val h = Harness(this)
        h.fetch = { BatteryFetch.Served(state(level = 9)) }
        h.repository.refresh("u2")
        assertThat(h.repository.roster.value.stateOf("u2")?.level).isEqualTo(9)

        h.fetch = { BatteryFetch.Unavailable }
        h.repository.refresh("u2")
        assertThat(h.repository.roster.value.stateOf("u2")?.level).isEqualTo(9)

        h.fetch = { BatteryFetch.Served(null) }
        h.repository.refresh("u2")
        assertThat(h.repository.roster.value.stateOf("u2")).isNull()
    }

    @Test
    fun `un rattrapage servi a un autre compte est jete`() = runTest {
        val h = Harness(this)
        h.snapshot = { h.viewer = "other"; listOf(state()) }
        h.repository.catchUp()
        assertThat(h.repository.roster.value.byUser).isEmpty()
    }

    @Test
    fun `le changement de compte vide tout`() = runTest {
        val h = Harness(this)
        h.fetch = { BatteryFetch.Served(state()) }
        h.repository.refresh("u2")
        h.repository.clear()
        assertThat(h.repository.roster.value.byUser).isEmpty()
    }

    @Test
    fun `au demarrage a froid, l'etat range du meme compte se peint avant toute socket`() = runTest {
        val cache = MemoryCache(BatteryRosterSnapshot.of("me", BatteryRoster().receive(state(level = 4))))
        val h = Harness(this, cache)
        assertThat(h.repository.roster.value.stateOf("u2")?.level).isEqualTo(4)
        assertThat(h.connected.value).isFalse()
    }

    @Test
    fun `le cache d'un autre compte ne se peint pas`() = runTest {
        val cache = MemoryCache(BatteryRosterSnapshot.of("other", BatteryRoster().receive(state(level = 4))))
        val h = Harness(this, cache)
        assertThat(h.repository.roster.value.byUser).isEmpty()
    }

    @Test
    fun `chaque etat servi se range, et cleared le retire du cache`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()
        h.events.emit(BatteryEvent.Changed(state(level = 7), null))
        testScheduler.runCurrent()
        assertThat(h.cache.stored?.restore("me", 20L)?.stateOf("u2")?.level).isEqualTo(7)

        h.events.emit(BatteryEvent.Cleared("u2", null))
        testScheduler.runCurrent()
        assertThat(h.cache.stored?.restore("me", 20L)?.byUser).isEmpty()
    }

    @Test
    fun `le changement de compte vide aussi le cache`() = runTest {
        val cache = MemoryCache(BatteryRosterSnapshot.of("me", BatteryRoster().receive(state(level = 4))))
        val h = Harness(this, cache)
        h.repository.clear()
        testScheduler.runCurrent()
        assertThat(h.cache.stored?.restore("me", 20L)?.byUser.orEmpty()).isEmpty()
    }
}
