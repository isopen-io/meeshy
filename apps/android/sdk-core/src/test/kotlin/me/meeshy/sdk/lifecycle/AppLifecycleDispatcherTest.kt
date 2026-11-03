package me.meeshy.sdk.lifecycle

import com.google.common.truth.Truth.assertThat
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.lifecycle.TrimLevel
import org.junit.Test

class AppLifecycleDispatcherTest {
    private fun hook(
        label: String,
        order: Int = 0,
        journal: MutableList<String>,
        failing: Boolean = false,
    ) = object : AppLifecycleHook {
        override val priority = order
        override val name = label
        override suspend fun onAppCreate() {
            journal += "$label:create:${Thread.currentThread().name}"
            if (failing) error("boom")
        }
        override suspend fun onForeground() { journal += "$label:fg" }
        override suspend fun onBackground() { journal += "$label:bg" }
        override suspend fun onTrimMemory(level: TrimLevel) { journal += "$label:trim:$level" }
    }

    private fun dispatcher(vararg hooks: AppLifecycleHook) =
        AppLifecycleDispatcher(hooks.toSet(), Dispatchers.IO)

    private fun List<String>.stripThread() = map { it.substringBeforeLast(":") }

    @Test
    fun `events reach hooks by priority then name`() = runBlocking {
        val journal = CopyOnWriteArrayList<String>()
        val dispatcher = dispatcher(
            hook("b", 1, journal), hook("z", 0, journal), hook("a", 1, journal),
        )
        dispatcher.onForeground().join()
        dispatcher.onBackground().join()
        dispatcher.onTrimMemory(TrimLevel.COMPLETE).join()

        assertThat(journal).containsExactly(
            "z:fg", "a:fg", "b:fg", "z:bg", "a:bg", "b:bg",
            "z:trim:COMPLETE", "a:trim:COMPLETE", "b:trim:COMPLETE",
        ).inOrder()
    }

    @Test
    fun `a failing hook does not stop the next ones`() = runBlocking {
        val journal = CopyOnWriteArrayList<String>()
        dispatcher(
            hook("first", 0, journal),
            hook("boom", 1, journal, failing = true),
            hook("last", 2, journal),
        ).onAppCreate().join()

        assertThat(journal.stripThread()).containsExactly("first:create", "boom:create", "last:create").inOrder()
    }

    @Test
    fun `hooks run off the calling thread`() = runBlocking {
        val journal = CopyOnWriteArrayList<String>()
        val caller = Thread.currentThread().name
        dispatcher(hook("a", 0, journal)).onAppCreate().join()

        assertThat(journal.single().substringAfterLast(":")).isNotEqualTo(caller)
    }
}
