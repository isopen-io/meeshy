package me.meeshy.sdk.phonereachability

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityAnnouncement
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityAnnouncementKind
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityEvent
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityRoster
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityRosterSnapshot
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityState
import me.meeshy.sdk.model.phonereachability.PhoneUnreachableCause
import org.junit.Test

/** Le magasin du téléphone injoignable (#18737) : socket, rattrapage à la connexion, relecture, compte, cache. */
class PhoneReachabilityRepositoryTest {

    private class MemoryCache(var stored: PhoneReachabilityRosterSnapshot? = null) : PhoneReachabilityRosterCache {
        override fun read(): PhoneReachabilityRosterSnapshot? = stored

        override fun write(snapshot: PhoneReachabilityRosterSnapshot?) {
            stored = snapshot
        }
    }

    private class Harness(scope: TestScope, val cache: MemoryCache = MemoryCache(), val now: Long = 20L) {
        val events = MutableSharedFlow<PhoneReachabilityEvent>(extraBufferCapacity = 8)
        val connected = MutableStateFlow(false)
        var viewer: String? = "me"
        var snapshot: suspend () -> List<PhoneReachabilityState>? = { emptyList() }
        var fetch: suspend (String) -> PhoneReachabilityFetch = { PhoneReachabilityFetch.Unavailable }
        val repository = PhoneReachabilityRepository(
            PhoneReachabilitySources(
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

    private fun state(userId: String = "u2", since: Long = 10L, cause: PhoneUnreachableCause = PhoneUnreachableCause.NETWORK) =
        PhoneReachabilityState(userId, since, cause)

    private val announcement = PhoneReachabilityAnnouncement(PhoneReachabilityAnnouncementKind.UNREACHABLE, 10L)

    @Test
    fun `un etat recu s'affiche et reachable l'efface`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()
        h.events.emit(PhoneReachabilityEvent.Unreachable(state(), null))
        testScheduler.runCurrent()
        assertThat(h.repository.roster.value.stateOf("u2")?.cause).isEqualTo(PhoneUnreachableCause.NETWORK)

        h.events.emit(PhoneReachabilityEvent.Reachable("u2", null))
        testScheduler.runCurrent()
        assertThat(h.repository.roster.value.stateOf("u2")).isNull()
    }

    @Test
    fun `seule une annonce servie atteint la pastille, jamais la mienne`() = runTest {
        val h = Harness(this)
        val seen = mutableListOf<PhoneReachabilityNotice>()
        val job = launch { h.repository.notices.collect { seen += it } }
        testScheduler.runCurrent()
        h.events.emit(PhoneReachabilityEvent.Unreachable(state(), null))
        h.events.emit(PhoneReachabilityEvent.Unreachable(state(since = 11L), announcement))
        h.events.emit(PhoneReachabilityEvent.Unreachable(state(userId = "me"), announcement))
        testScheduler.runCurrent()
        assertThat(seen).containsExactly(PhoneReachabilityNotice("u2", announcement, unreachableSinceMillis = 11L))
        job.cancel()
    }

    @Test
    fun `la connexion rattrape, sans ressusciter ce qu'un retour a efface entre-temps`() = runTest {
        val h = Harness(this)
        val gate = CompletableDeferred<List<PhoneReachabilityState>>()
        h.snapshot = { gate.await() }
        testScheduler.runCurrent()
        h.connected.value = true
        testScheduler.runCurrent()

        h.events.emit(PhoneReachabilityEvent.Reachable("u2", null))
        testScheduler.runCurrent()
        gate.complete(listOf(state("u2"), state("u3")))
        testScheduler.runCurrent()

        assertThat(h.repository.roster.value.byUser.keys).containsExactly("u3")
    }

    @Test
    fun `une relecture pose l'etat servi, nul l'efface, une panne ne change rien`() = runTest {
        val h = Harness(this)
        h.fetch = { PhoneReachabilityFetch.Served(state(cause = PhoneUnreachableCause.BATTERY)) }
        h.repository.refresh("u2")
        assertThat(h.repository.roster.value.stateOf("u2")?.cause).isEqualTo(PhoneUnreachableCause.BATTERY)

        h.fetch = { PhoneReachabilityFetch.Unavailable }
        h.repository.refresh("u2")
        assertThat(h.repository.roster.value.stateOf("u2")).isNotNull()

        h.fetch = { PhoneReachabilityFetch.Served(null) }
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
    fun `au demarrage a froid, l'etat range du meme compte se peint avant toute socket`() = runTest {
        val cache = MemoryCache(PhoneReachabilityRosterSnapshot.of("me", PhoneReachabilityRoster().receive(state())))
        val h = Harness(this, cache)
        assertThat(h.repository.roster.value.stateOf("u2")).isNotNull()
        assertThat(h.connected.value).isFalse()
        val foreign = Harness(this, MemoryCache(PhoneReachabilityRosterSnapshot.of("other", PhoneReachabilityRoster().receive(state()))))
        assertThat(foreign.repository.roster.value.byUser).isEmpty()
    }

    @Test
    fun `chaque etat servi se range, reachable le retire et le changement de compte vide tout`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()
        h.events.emit(PhoneReachabilityEvent.Unreachable(state(), null))
        testScheduler.runCurrent()
        assertThat(h.cache.stored?.restore("me", 20L)?.stateOf("u2")).isNotNull()

        h.events.emit(PhoneReachabilityEvent.Reachable("u2", null))
        testScheduler.runCurrent()
        assertThat(h.cache.stored?.restore("me", 20L)?.byUser.orEmpty()).isEmpty()

        h.events.emit(PhoneReachabilityEvent.Unreachable(state(userId = "u3"), null))
        testScheduler.runCurrent()
        h.repository.clear()
        testScheduler.runCurrent()
        assertThat(h.repository.roster.value.byUser).isEmpty()
        assertThat(h.cache.stored?.restore("me", 20L)?.byUser.orEmpty()).isEmpty()
    }
}
