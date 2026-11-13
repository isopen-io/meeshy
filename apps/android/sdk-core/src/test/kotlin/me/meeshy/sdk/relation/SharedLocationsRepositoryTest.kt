package me.meeshy.sdk.relation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.relation.SharedLocation
import me.meeshy.sdk.model.relation.SharedLocationBounds
import me.meeshy.sdk.model.relation.SharedLocationEndedEvent
import me.meeshy.sdk.model.relation.SharedLocationPrecision
import org.junit.Test

/** Le branchement des positions qu'on me partage (#16985) : socket, rattrapage à la connexion, échéance, compte. */
class SharedLocationsRepositoryTest {
    private val hour = 3_600_000L

    private class Harness(scope: TestScope) {
        val changed = MutableSharedFlow<SharedLocation>(extraBufferCapacity = 8)
        val ended = MutableSharedFlow<SharedLocationEndedEvent>(extraBufferCapacity = 8)
        val connected = MutableStateFlow(false)
        var viewer: String? = "me"
        var snapshot: suspend (SharedLocationBounds?) -> List<SharedLocation>? = { emptyList() }
        val asked = mutableListOf<SharedLocationBounds?>()
        val repository = SharedLocationsRepository(
            SharedLocationSources(
                changed = changed,
                ended = ended,
                connected = connected,
                snapshot = { bounds -> asked += bounds; snapshot(bounds) },
                viewerId = { viewer },
            ),
            StandardTestDispatcher(scope.testScheduler),
            now = { scope.testScheduler.currentTime },
        )
    }

    private fun location(userId: String = "u2", updatedAt: Long = 0L, expiresAt: Long = hour) =
        SharedLocation(userId, 48.85, 2.35, SharedLocationPrecision.CITY, 12_000.0, null, updatedAt, expiresAt)

    @Test
    fun `une position recue par la socket s'affiche, sa fin l'efface`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()

        h.changed.emit(location())
        testScheduler.runCurrent()
        assertThat(h.repository.byUser.value.keys).containsExactly("u2")

        h.ended.emit(SharedLocationEndedEvent("u2"))
        testScheduler.runCurrent()
        assertThat(h.repository.byUser.value).isEmpty()
    }

    @Test
    fun `une position s'eteint a son echeance sans evenement du serveur`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()
        h.changed.emit(location(expiresAt = hour))
        testScheduler.runCurrent()

        testScheduler.advanceTimeBy(hour - 1)
        testScheduler.runCurrent()
        assertThat(h.repository.byUser.value.keys).containsExactly("u2")

        testScheduler.advanceTimeBy(1)
        testScheduler.runCurrent()
        assertThat(h.repository.byUser.value).isEmpty()
    }

    @Test
    fun `chaque socket accrochee rattrape toute la carte, et le rattrapage fait foi`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()
        h.changed.emit(location(userId = "u2"))
        testScheduler.runCurrent()
        h.snapshot = { listOf(location(userId = "u3")) }

        h.connected.value = true
        testScheduler.runCurrent()

        assertThat(h.asked).containsExactly(null)
        assertThat(h.repository.byUser.value.keys).containsExactly("u3")
    }

    @Test
    fun `un rattrapage en panne ne change rien`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()
        h.changed.emit(location(userId = "u2"))
        testScheduler.runCurrent()
        h.snapshot = { null }

        h.repository.catchUp(null)

        assertThat(h.repository.byUser.value.keys).containsExactly("u2")
    }

    @Test
    fun `un rattrapage parti sous un autre compte ne remplit pas le compte suivant`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()
        val answer = CompletableDeferred<List<SharedLocation>>()
        h.snapshot = { answer.await() }
        val pending = launch { h.repository.catchUp(null) }
        testScheduler.runCurrent()

        h.viewer = "other"
        h.repository.clear()
        answer.complete(listOf(location(userId = "u2")))
        pending.join()

        assertThat(h.repository.byUser.value).isEmpty()
    }

    @Test
    fun `la deconnexion du compte vide les positions`() = runTest {
        val h = Harness(this)
        testScheduler.runCurrent()
        h.changed.emit(location())
        testScheduler.runCurrent()

        h.repository.clear()

        assertThat(h.repository.byUser.value).isEmpty()
    }
}
