package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PrefetchAccountGuardTest {

    private fun TestScope.prefetcher(source: FakePrefetchSource, store: FakePrefetchStore) =
        ConversationListMessagePrefetcher(source, store, StandardTestDispatcher(testScheduler))

    private fun request(ids: List<String>, owner: String = "u1", stillOwner: () -> Boolean) =
        MessagePrefetchRequest(ids.map { candidate(it) }, owner, stillOwner)

    @Test
    fun `un compte qui n est plus actif ne declenche aucune requete`() = runTest {
        val source = FakePrefetchSource()
        val store = FakePrefetchStore()
        val prefetcher = prefetcher(source, store)
        prefetcher.schedule(request(listOf("a", "b"), stillOwner = { false }))
        prefetcher.waitUntilIdle()
        assertThat(source.requested).isEmpty()
        assertThat(store.persisted).isEmpty()
    }

    @Test
    fun `un identifiant de compte vide ne declenche aucune requete`() = runTest {
        val source = FakePrefetchSource()
        val prefetcher = prefetcher(source, FakePrefetchStore())
        prefetcher.schedule(request(listOf("a"), owner = "", stillOwner = { true }))
        prefetcher.waitUntilIdle()
        assertThat(source.requested).isEmpty()
    }

    @Test
    fun `un changement de compte en cours de passe n ecrit rien`() = runTest {
        var active = true
        val network = CompletableDeferred<Unit>()
        val source = FakePrefetchSource(gate = network)
        val store = FakePrefetchStore()
        store.onPersist = { active = false }
        val prefetcher = prefetcher(source, store)
        prefetcher.schedule(request((1..8).map { "c$it" }, stillOwner = { active }))
        runCurrent()
        network.complete(Unit)
        prefetcher.waitUntilIdle()
        // The first batch of four was already in flight; the second batch never starts.
        assertThat(source.requested).hasSize(4)
        assertThat(store.persisted.size).isAtMost(1)
    }
}
