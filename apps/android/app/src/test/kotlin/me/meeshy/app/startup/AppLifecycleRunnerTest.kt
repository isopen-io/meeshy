package me.meeshy.app.startup

import com.google.common.truth.Truth.assertThat
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertThrows
import org.junit.Test

class AppLifecycleRunnerTest {
    private class Clock(var now: Long = 10_000L)

    private fun task(
        label: String,
        order: Int = 0,
        journal: MutableList<String>,
        failing: Boolean = false,
    ) = object : AppLifecycleTask {
        override val name = label
        override val priority = order
        override suspend fun onStartup() {
            journal += "$label:startup"
            if (failing) error("boom")
        }
        override suspend fun onForeground() { journal += "$label:fg" }
    }

    private fun runner(clock: Clock, strict: Boolean = true, vararg tasks: AppLifecycleTask) =
        AppLifecycleRunner(tasks.toSet(), Dispatchers.IO, { clock.now }, strict)

    @Test
    fun `startup runs once in priority order`() = runBlocking {
        val journal = CopyOnWriteArrayList<String>()
        val runner = runner(Clock(), true, task("b", 1, journal), task("a", 0, journal))
        runner.runStartup()?.join()
        assertThat(runner.runStartup()).isNull()
        assertThat(journal).containsExactly("a:startup", "b:startup").inOrder()
    }

    @Test
    fun `a failing task does not block the others`() = runBlocking {
        val journal = CopyOnWriteArrayList<String>()
        runner(Clock(), true, task("a", 0, journal, failing = true), task("b", 1, journal))
            .runStartup()?.join()
        assertThat(journal).containsExactly("a:startup", "b:startup").inOrder()
    }

    @Test
    fun `foreground is debounced under 500 ms`() = runBlocking {
        val journal = CopyOnWriteArrayList<String>()
        val clock = Clock()
        val runner = runner(clock, true, task("a", 0, journal))
        runner.runForeground()?.join()
        clock.now += 499
        assertThat(runner.runForeground()).isNull()
        clock.now += 1
        runner.runForeground()?.join()
        assertThat(journal).containsExactly("a:fg", "a:fg")
    }

    @Test
    fun `duplicate names fail a debug build`() {
        val journal = mutableListOf<String>()
        assertThrows(IllegalStateException::class.java) {
            runner(Clock(), true, task("same", 0, journal), task("same", 1, journal))
        }
    }
}
