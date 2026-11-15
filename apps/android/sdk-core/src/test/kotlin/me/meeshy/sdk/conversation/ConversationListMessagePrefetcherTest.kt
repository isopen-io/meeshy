package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.chat.HeldMessageWindow
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationListMessagePrefetcherTest {

    private fun TestScope.prefetcher(source: FakePrefetchSource, store: FakePrefetchStore) =
        ConversationListMessagePrefetcher(source, store, StandardTestDispatcher(testScheduler))

    private fun request(ids: List<String>, owner: String = "u1", stillOwner: () -> Boolean = { true }) =
        MessagePrefetchRequest(ids.map { candidate(it) }, owner, stillOwner)

    @Test
    fun `au plus quatre requetes simultanees`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val source = FakePrefetchSource(gate = gate)
        val prefetcher = prefetcher(source, FakePrefetchStore())
        prefetcher.schedule(request((1..10).map { "c$it" }))
        runCurrent()
        assertThat(source.requested).hasSize(4)
        gate.complete(Unit)
        prefetcher.waitUntilIdle()
        assertThat(source.requested).hasSize(10)
        assertThat(source.maxConcurrent).isEqualTo(4)
    }

    @Test
    fun `une demande arrivee pendant la passe la suit et la plus recente remplace celle qui attendait`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val source = FakePrefetchSource(gate = gate)
        val prefetcher = prefetcher(source, FakePrefetchStore())
        prefetcher.schedule(request(listOf("a")))
        runCurrent()
        prefetcher.schedule(request(listOf("b")))
        prefetcher.schedule(request(listOf("c")))
        gate.complete(Unit)
        prefetcher.waitUntilIdle()
        assertThat(source.requested).containsExactly("a", "c").inOrder()
    }

    @Test
    fun `un echec n entre pas au registre et la passe suivante le retente`() = runTest {
        val failing = FakePrefetchSource(failing = setOf("a"))
        val store = FakePrefetchStore()
        val prefetcher = prefetcher(failing, store)
        prefetcher.schedule(request(listOf("a", "b")))
        prefetcher.waitUntilIdle()
        assertThat(store.persisted).containsExactly("b")
        prefetcher.schedule(request(listOf("a", "b")))
        prefetcher.waitUntilIdle()
        assertThat(failing.requested.count { it == "a" }).isEqualTo(2)
        assertThat(failing.requested.count { it == "b" }).isEqualTo(1)
    }

    @Test
    fun `une conversation courte deja rapportee n est pas redemandee`() = runTest {
        val source = FakePrefetchSource()
        val store = FakePrefetchStore(mapOf("a" to HeldMessageWindow(2, setOf("m-a"), 1_000L)))
        val prefetcher = prefetcher(source, store)
        prefetcher.schedule(request(listOf("a")))
        prefetcher.waitUntilIdle()
        prefetcher.schedule(request(listOf("a")))
        prefetcher.waitUntilIdle()
        assertThat(source.requested).containsExactly("a")
    }

    @Test
    fun `une conversation dont la base detient un ecran est sautee`() = runTest {
        val source = FakePrefetchSource()
        val store = FakePrefetchStore(mapOf("a" to HeldMessageWindow(25, setOf("m-a"), 1_000L)))
        prefetcher(source, store).run {
            schedule(request(listOf("a", "b")))
            waitUntilIdle()
        }
        assertThat(source.requested).containsExactly("b")
    }

    @Test
    fun `la reconnexion arme un rechargement consomme une seule fois`() = runTest {
        val prefetcher = prefetcher(FakePrefetchSource(), FakePrefetchStore())
        assertThat(prefetcher.takeReloadArm()).isFalse()
        prefetcher.armForNextReload()
        assertThat(prefetcher.takeReloadArm()).isTrue()
        assertThat(prefetcher.takeReloadArm()).isFalse()
        advanceUntilIdle()
    }
}
