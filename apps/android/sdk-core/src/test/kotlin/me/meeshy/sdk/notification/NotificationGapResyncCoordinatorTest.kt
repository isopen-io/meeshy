package me.meeshy.sdk.notification

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class NotificationGapResyncCoordinatorTest {

    private class Fixture(
        val gaps: MutableSharedFlow<Unit>,
        val reconnections: MutableSharedFlow<Unit>,
        val foregrounds: MutableSharedFlow<Unit>,
        val coordinator: NotificationGapResyncCoordinator,
        val runs: () -> Int,
    )

    private fun TestScope.fixture(failing: Boolean = false): Fixture {
        var runs = 0
        val gaps = MutableSharedFlow<Unit>()
        val reconnections = MutableSharedFlow<Unit>()
        val foregrounds = MutableSharedFlow<Unit>()
        val coordinator = NotificationGapResyncCoordinator(
            runner = NotificationResyncRunner {
                runs++
                if (failing) error("réseau")
            },
            gaps = gaps,
            reconnections = reconnections,
            foregrounds = foregrounds,
            scope = backgroundScope,
        )
        return Fixture(gaps, reconnections, foregrounds, coordinator) { runs }
    }

    @Test
    fun `un trou de sequence relit une fois apres 300 ms`() = runTest {
        val f = fixture().also { it.coordinator.attach() }
        runCurrent()

        f.gaps.emit(Unit)
        advanceTimeBy(299)
        assertThat(f.runs()).isEqualTo(0)
        advanceTimeBy(2)

        assertThat(f.runs()).isEqualTo(1)
    }

    @Test
    fun `un trou, une reconnexion et un retour au premier plan se coalescent en une relecture`() = runTest {
        val f = fixture().also { it.coordinator.attach() }
        runCurrent()

        f.gaps.emit(Unit)
        advanceTimeBy(100)
        f.reconnections.emit(Unit)
        advanceTimeBy(100)
        f.foregrounds.emit(Unit)
        advanceTimeBy(1_000)

        assertThat(f.runs()).isEqualTo(1)
    }

    @Test
    fun `le simple attachement au demarrage a froid ne relit rien`() = runTest {
        val f = fixture().also { it.coordinator.attach() }

        advanceTimeBy(5_000)

        assertThat(f.runs()).isEqualTo(0)
    }

    @Test
    fun `sans session, apres detachement, aucun declencheur n'agit`() = runTest {
        val f = fixture().also { it.coordinator.attach() }
        runCurrent()
        f.coordinator.detach()

        f.gaps.emit(Unit)
        f.foregrounds.emit(Unit)
        advanceTimeBy(1_000)

        assertThat(f.runs()).isEqualTo(0)
    }

    @Test
    fun `la deconnexion annule la relecture en attente`() = runTest {
        val f = fixture().also { it.coordinator.attach() }
        runCurrent()
        f.reconnections.emit(Unit)
        advanceTimeBy(100)

        f.coordinator.detach()
        advanceTimeBy(1_000)

        assertThat(f.runs()).isEqualTo(0)
    }

    @Test
    fun `un echec n'arrete pas les resynchros suivantes`() = runTest {
        val f = fixture(failing = true).also { it.coordinator.attach() }
        runCurrent()

        f.gaps.emit(Unit)
        advanceTimeBy(400)
        f.gaps.emit(Unit)
        advanceTimeBy(400)

        assertThat(f.runs()).isEqualTo(2)
    }
}
