package me.meeshy.sdk.session

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.auth.SessionClosingStep
import me.meeshy.sdk.model.auth.SessionOpeningStep
import me.meeshy.sdk.model.auth.SessionTransitionContext
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionTransitionExecutorTest {

    private class FakeRunner(
        private val failingClosing: Set<SessionClosingStep> = emptySet(),
        private val hasActiveCall: Boolean = false,
    ) : SessionStepRunner {
        val log = mutableListOf<Any>()
        override suspend fun context() = SessionTransitionContext("u1", friendshipsHydrated = false, hasActiveCall = hasActiveCall)
        override suspend fun run(step: SessionOpeningStep) {
            log += step
        }
        override suspend fun run(step: SessionClosingStep) {
            log += step
            if (step in failingClosing) error("boom")
        }
    }

    private fun TestScope.executor(runner: SessionStepRunner) =
        SessionTransitionExecutor(runner, CoroutineScope(UnconfinedTestDispatcher(testScheduler)))

    @Test
    fun `une ouverture execute les etapes d'ouverture dans l'ordre du plan`() = runTest {
        val runner = FakeRunner()
        val executor = executor(runner)

        executor.onAuthenticatedChanged(true)

        assertThat(runner.log.first()).isEqualTo(SessionOpeningStep.TagCrashReports("u1"))
        assertThat(runner.log.last()).isEqualTo(SessionOpeningStep.MigrateLegacyKeys)
    }

    @Test
    fun `une etape qui leve n'arrete pas la suite`() = runTest {
        val runner = FakeRunner(failingClosing = setOf(SessionClosingStep.PurgeWidgets))
        val executor = executor(runner)
        executor.onAuthenticatedChanged(true)
        runner.log.clear()

        executor.closeSession()

        assertThat(runner.log.first()).isEqualTo(SessionClosingStep.PurgeDynamicShortcuts)
        assertThat(runner.log).contains(SessionClosingStep.CancelBackgroundTasks)
        assertThat(runner.log.last()).isEqualTo(SessionClosingStep.CancelBackgroundTasks)
    }

    @Test
    fun `deux fermetures successives n'ont qu'un seul effet`() = runTest {
        val runner = FakeRunner()
        val executor = executor(runner)
        executor.onAuthenticatedChanged(true)
        runner.log.clear()

        executor.closeSession()
        val afterFirst = runner.log.size
        executor.closeSession()
        executor.onAuthenticatedChanged(false)

        assertThat(runner.log).hasSize(afterFirst)
    }

    @Test
    fun `fermer un appareil deja propre ne leve rien et ne fait rien`() = runTest {
        val runner = FakeRunner()
        executor(runner).closeSession()
        assertThat(runner.log).isEmpty()
    }

    @Test
    fun `un appel actif est termine a la fermeture`() = runTest {
        val runner = FakeRunner(hasActiveCall = true)
        val executor = executor(runner)
        executor.onAuthenticatedChanged(true)
        executor.closeSession()
        assertThat(runner.log).contains(SessionClosingStep.EndActiveCall)
    }
}
