package me.meeshy.sdk.fall

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.fall.FallClearedReason
import me.meeshy.sdk.model.fall.FallEvent
import me.meeshy.sdk.model.fall.FallRosterSnapshot
import me.meeshy.sdk.model.fall.FallState
import me.meeshy.sdk.model.inactivity.InactivityLastBattery
import me.meeshy.sdk.model.inactivity.InactivityLastPosition
import org.junit.Test

/** Le magasin des chutes détectées (#18748) : socket, levée poussée, rattrapage, compte, cache SANS position, expiration. */
class FallRepositoryTest {

    private class MemoryCache(var stored: FallRosterSnapshot? = null) : FallRosterCache {
        override fun read(): FallRosterSnapshot? = stored

        override fun write(snapshot: FallRosterSnapshot?) {
            stored = snapshot
        }
    }

    private class Harness(scope: TestScope, val cache: MemoryCache = MemoryCache()) {
        val events = MutableSharedFlow<FallEvent>(extraBufferCapacity = 8)
        val connected = MutableStateFlow(false)
        var viewer: String? = "me"
        var now: Long = 1_000L
        var snapshot: suspend () -> List<FallState>? = { emptyList() }
        val repository = FallRepository(
            FallSources(
                events = events,
                connected = connected,
                snapshot = { snapshot() },
                viewerId = { viewer },
                cache = cache,
                now = { now },
                ticks = emptyFlow(),
            ),
            StandardTestDispatcher(scope.testScheduler),
        )
    }

    private fun state(userId: String = "u2", expires: Long = 10_000L, position: InactivityLastPosition? = null) =
        FallState(userId, 900L, expires, lastPosition = position, lastBattery = InactivityLastBattery(41, 900L))

    @Test
    fun `une chute recue s'affiche, cleared l'efface, et une levee poussee aussi`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()
        h.events.emit(FallEvent.Detected(state(), null))
        testScheduler.runCurrent()
        assertThat(h.repository.stateOf("u2").first()?.lastBattery?.level).isEqualTo(41)
        h.events.emit(FallEvent.Cleared("u2", FallClearedReason.EXPIRED))
        testScheduler.runCurrent()
        assertThat(h.repository.stateOf("u2").first()).isNull()

        h.events.emit(FallEvent.Detected(state(userId = "u3"), null))
        testScheduler.runCurrent()
        h.repository.clearFromPush("u3")
        assertThat(h.repository.stateOf("u3").first()).isNull()
    }

    @Test
    fun `un episode dont expiresAt est passe ne s'affiche plus`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()
        h.events.emit(FallEvent.Detected(state(expires = 2_000L), null))
        testScheduler.runCurrent()
        h.now = 2_000L
        assertThat(h.repository.stateOf("u2").first()).isNull()
    }

    @Test
    fun `seules l'annonce servie et la reponse atteignent la pastille, jamais ma propre chute`() = runTest {
        val h = Harness(this)
        val seen = mutableListOf<FallNotice>()
        val job = launch { h.repository.notices.collect { seen += it } }
        testScheduler.runCurrent()
        h.events.emit(FallEvent.Detected(state(), null))
        h.events.emit(FallEvent.Detected(state(), 900L))
        h.events.emit(FallEvent.Detected(state(userId = "me"), 900L))
        h.events.emit(FallEvent.Cleared("u2", FallClearedReason.WITHDRAWN))
        h.events.emit(FallEvent.Cleared("u2", FallClearedReason.RESPONDED))
        testScheduler.runCurrent()
        assertThat(seen.map { it.userId to it.kind })
            .containsExactly("u2" to FallNotice.Kind.DETECTED, "u2" to FallNotice.Kind.RESPONDED).inOrder()
        assertThat(h.repository.roster.value.byUser).doesNotContainKey("me")
        job.cancel()
    }

    @Test
    fun `la position n'est jamais ecrite sur disque`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()
        h.events.emit(FallEvent.Detected(state(position = InactivityLastPosition(48.85, 2.35, 20.0, 900L)), null))
        testScheduler.runCurrent()
        assertThat(h.repository.stateOf("u2").first()?.lastPosition).isNotNull()
        assertThat(h.cache.stored?.items?.single()?.toString()).doesNotContain("48.85")
        assertThat(h.cache.stored?.restore("me", 1_000L)?.stateOf("u2", 1_000L)?.lastPosition).isNull()
    }

    @Test
    fun `le rattrapage a la connexion fait foi, et la deconnexion vide tout, cache compris`() = runTest {
        val h = Harness(this)
        h.snapshot = { listOf(state(userId = "u4")) }
        testScheduler.runCurrent()
        h.connected.value = true
        testScheduler.runCurrent()
        assertThat(h.repository.roster.value.byUser.keys).containsExactly("u4")
        h.repository.clear()
        assertThat(h.repository.roster.value.byUser).isEmpty()
        assertThat(h.cache.stored).isNull()
    }

    @Test
    fun `le cache d'un autre compte ne se repeint pas`() = runTest {
        val cache = MemoryCache(FallRosterSnapshot("other", listOf(state().let { me.meeshy.sdk.model.fall.FallStoredState(it.userId, "1970-01-01T00:00:00.900Z", "1970-01-01T00:00:10Z") })))
        val h = Harness(this, cache)
        assertThat(h.repository.roster.value.byUser).isEmpty()
    }

    @Test
    fun `un episode tombe a son expiration, en memoire et sur le disque, sans autre evenement`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()
        h.events.emit(FallEvent.Detected(state(userId = "tot", expires = 2_000L), null))
        h.events.emit(FallEvent.Detected(state(userId = "tard", expires = 10_000L), null))
        testScheduler.runCurrent()
        h.now = 2_000L
        testScheduler.advanceTimeBy(1_000L)
        testScheduler.runCurrent()
        assertThat(h.repository.roster.value.byUser.keys).containsExactly("tard")
        assertThat(h.cache.stored?.items?.map { it.userId }).containsExactly("tard")
    }

    @Test
    fun `un etat deja expire au moment d'ecrire ne s'ecrit pas`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()
        h.events.emit(FallEvent.Detected(state(userId = "tot", expires = 2_000L), null))
        testScheduler.runCurrent()
        h.now = 3_000L
        h.events.emit(FallEvent.Detected(state(userId = "tard", expires = 10_000L), null))
        testScheduler.runCurrent()
        assertThat(h.cache.stored?.items?.map { it.userId }).containsExactly("tard")
    }
}
