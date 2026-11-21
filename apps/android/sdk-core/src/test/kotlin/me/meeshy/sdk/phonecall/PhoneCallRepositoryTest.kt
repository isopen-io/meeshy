package me.meeshy.sdk.phonecall

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.phonecall.PhoneCallAnnouncement
import me.meeshy.sdk.model.phonecall.PhoneCallAnnouncementKind
import me.meeshy.sdk.model.phonecall.PhoneCallEvent
import me.meeshy.sdk.model.phonecall.PhoneCallRoster
import me.meeshy.sdk.model.phonecall.PhoneCallRosterSnapshot
import me.meeshy.sdk.model.phonecall.PhoneCallState
import org.junit.Test

/** Le magasin « en appel » (#18753) : socket, rattrapage à la connexion, compte, cache, expiration. */
class PhoneCallRepositoryTest {

    private class MemoryCache(var stored: PhoneCallRosterSnapshot? = null) : PhoneCallRosterCache {
        override fun read(): PhoneCallRosterSnapshot? = stored

        override fun write(snapshot: PhoneCallRosterSnapshot?) {
            stored = snapshot
        }
    }

    private class Harness(scope: TestScope, val cache: MemoryCache = MemoryCache(), val now: Long = 20L) {
        val events = MutableSharedFlow<PhoneCallEvent>(extraBufferCapacity = 8)
        val connected = MutableStateFlow(false)
        var viewer: String? = "me"
        var snapshot: suspend () -> List<PhoneCallState>? = { emptyList() }
        val repository = PhoneCallRepository(
            PhoneCallSources(
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

    private fun state(userId: String = "u2", since: Long = 10L, expires: Long = 10_000L) = PhoneCallState(userId, since, expires)

    private val started = PhoneCallAnnouncement(PhoneCallAnnouncementKind.STARTED, 11L)

    @Test
    fun `un etat recu s'affiche, un started silencieux le remplace et ended l'efface`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()
        h.events.emit(PhoneCallEvent.Started(state(since = 10L), started))
        h.events.emit(PhoneCallEvent.Started(state(since = 15L, expires = 20_000L), null))
        testScheduler.runCurrent()
        assertThat(h.repository.roster.value.stateOf("u2", 20L)).isEqualTo(state(since = 15L, expires = 20_000L))

        h.events.emit(PhoneCallEvent.Ended("u2", null))
        testScheduler.runCurrent()
        assertThat(h.repository.roster.value.stateOf("u2", 20L)).isNull()
    }

    @Test
    fun `seule une annonce servie atteint la pastille, jamais la mienne`() = runTest {
        val h = Harness(this)
        val seen = mutableListOf<PhoneCallNotice>()
        val job = launch { h.repository.notices.collect { seen += it } }
        testScheduler.runCurrent()
        h.events.emit(PhoneCallEvent.Started(state(), null))
        h.events.emit(PhoneCallEvent.Started(state(since = 11L), started))
        h.events.emit(PhoneCallEvent.Started(state(userId = "me"), started))
        testScheduler.runCurrent()
        assertThat(seen).containsExactly(PhoneCallNotice("u2", started))
        job.cancel()
    }

    @Test
    fun `la connexion rattrape, sans ressusciter ce qu'un raccroche a efface entre-temps`() = runTest {
        val h = Harness(this)
        val gate = CompletableDeferred<List<PhoneCallState>>()
        h.snapshot = { gate.await() }
        testScheduler.runCurrent()
        h.connected.value = true
        testScheduler.runCurrent()

        h.events.emit(PhoneCallEvent.Ended("u2", null))
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
    fun `au demarrage a froid, l'etat range du meme compte se peint, l'expire non`() = runTest {
        val roster = PhoneCallRoster().receive(state()).receive(state(userId = "old", expires = 5L))
        val h = Harness(this, MemoryCache(PhoneCallRosterSnapshot.of("me", roster)))
        assertThat(h.repository.roster.value.byUser.keys).containsExactly("u2")
        val foreign = Harness(this, MemoryCache(PhoneCallRosterSnapshot.of("other", roster)))
        assertThat(foreign.repository.roster.value.byUser).isEmpty()
    }

    @Test
    fun `chaque etat servi se range, ended le retire et le changement de compte vide tout`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()
        h.events.emit(PhoneCallEvent.Started(state(), null))
        testScheduler.runCurrent()
        assertThat(h.cache.stored?.restore("me", 20L)?.stateOf("u2", 20L)).isNotNull()

        h.events.emit(PhoneCallEvent.Ended("u2", null))
        testScheduler.runCurrent()
        assertThat(h.cache.stored?.restore("me", 20L)?.byUser.orEmpty()).isEmpty()

        h.events.emit(PhoneCallEvent.Started(state(userId = "u3"), null))
        testScheduler.runCurrent()
        h.repository.clear()
        testScheduler.runCurrent()
        assertThat(h.repository.roster.value.byUser).isEmpty()
        assertThat(h.cache.stored?.restore("me", 20L)?.byUser.orEmpty()).isEmpty()
    }
}
