package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ListRefreshCoordinatorTest {

    private class RecordingInvalidation(
        override val neighbour: ListRefreshNeighbour,
        private val log: MutableList<ListRefreshNeighbour>,
        private val fails: Boolean = false,
    ) : ListRefreshInvalidation {
        override suspend fun invalidate() {
            log += neighbour
            if (fails) throw IllegalStateException("disk")
        }
    }

    private fun coordinator(log: MutableList<ListRefreshNeighbour>, failing: ListRefreshNeighbour? = null) =
        ListRefreshCoordinator(
            ListRefreshNeighbour.entries.map { RecordingInvalidation(it, log, fails = it == failing) }.toSet(),
        )

    private fun reloads(vararg reloads: suspend () -> Unit): List<suspend () -> Unit> = reloads.toList()

    @Test
    fun `tous les rechargements reussis invalident les caches voisins`() = runTest {
        val log = mutableListOf<ListRefreshNeighbour>()

        val outcome = coordinator(log).refresh(reloads({}, {}, {}, {}))

        assertThat(outcome.allSucceeded).isTrue()
        assertThat(log).containsExactlyElementsIn(ListRefreshNeighbour.entries).inOrder()
    }

    @Test
    fun `un seul rechargement en echec n invalide aucun cache`() = runTest {
        val log = mutableListOf<ListRefreshNeighbour>()
        val offline = IllegalStateException("offline")

        val outcome = coordinator(log).refresh(reloads({}, { throw offline }, {}))

        assertThat(outcome.allSucceeded).isFalse()
        assertThat(outcome.failureAt(1)).isSameInstanceAs(offline)
        assertThat(outcome.failureAt(0)).isNull()
        assertThat(log).isEmpty()
    }

    @Test
    fun `un echec n arrete pas les autres rechargements`() = runTest {
        var reloaded = 0

        coordinator(mutableListOf()).refresh(reloads({ throw IllegalStateException() }, { reloaded++ }, { reloaded++ }))

        assertThat(reloaded).isEqualTo(2)
    }

    @Test
    fun `les rechargements partent en parallele`() = runTest {
        val gate = CompletableDeferred<Unit>()
        var secondStarted = false

        val run = async {
            coordinator(mutableListOf()).refresh(reloads({ gate.await() }, { secondStarted = true }))
        }
        runCurrent()

        assertThat(secondStarted).isTrue()
        gate.complete(Unit)
        assertThat(run.await().allSucceeded).isTrue()
    }

    @Test
    fun `une invalidation en echec n empeche pas les suivantes`() = runTest {
        val log = mutableListOf<ListRefreshNeighbour>()

        coordinator(log, failing = ListRefreshNeighbour.MESSAGES).refresh(reloads({}))

        assertThat(log).containsExactlyElementsIn(ListRefreshNeighbour.entries).inOrder()
    }
}
