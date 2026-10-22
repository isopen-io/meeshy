package me.meeshy.app.startup

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AppInitializerRunnerTest {

    private fun initializer(
        label: String,
        order: Int = 0,
        journal: MutableList<String>,
        failure: Exception? = null,
    ) = object : AppInitializer {
        override val priority = order
        override val name = label
        override fun initialize() {
            journal += label
            failure?.let { throw it }
        }
    }

    @Test
    fun `initializers run by priority then name`() {
        val journal = mutableListOf<String>()
        val runner = AppInitializerRunner(
            setOf(
                initializer("b", order = 1, journal = journal),
                initializer("z", order = 0, journal = journal),
                initializer("a", order = 1, journal = journal),
            ),
        )

        runner.runAll()

        assertThat(journal).containsExactly("z", "a", "b").inOrder()
    }

    @Test
    fun `a failing initializer does not stop the next ones`() {
        val journal = mutableListOf<String>()
        val runner = AppInitializerRunner(
            setOf(
                initializer("first", order = 0, journal = journal),
                initializer("boom", order = 1, journal = journal, failure = IllegalStateException("boom")),
                initializer("last", order = 2, journal = journal),
            ),
        )

        runner.runAll()

        assertThat(journal).containsExactly("first", "boom", "last").inOrder()
    }

    @Test
    fun `runAll executes the set only once`() {
        val journal = mutableListOf<String>()
        val runner = AppInitializerRunner(setOf(initializer("only", journal = journal)))

        runner.runAll()
        runner.runAll()

        assertThat(journal).containsExactly("only")
    }

    @Test
    fun `an empty set is a no-op`() {
        AppInitializerRunner(emptySet()).runAll()
    }
}
