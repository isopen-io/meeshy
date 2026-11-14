package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Une destination de graphe ne redéclare plus sa poussée (#18365) : les écrans empilés prennent `stackEnter` /
 * `stackExit` / `stackPopEnter` / `stackPopExit` du `NavHost`, miroitées en RTL et réglées comme iOS. Une transition
 * locale ne se tolère que si elle délègue à [FeedOverlayTransition], à `EnterTransition.None` / `ExitTransition.None`
 * ou à une fonction `stack*`.
 *
 * Mesuré le 2026-11-14 : 28 transitions locales (jeu 24, Réglages 4), ramenées à 0 par #18365. Le plafond 0 vaut
 * interdiction.
 */
class GraphTransitionsGuardTest {

    private val transition = Regex("""\b(enterTransition|exitTransition|popEnterTransition|popExitTransition)\s*=\s*\{""")
    private val delegated = Regex("""FeedOverlayTransition|EnterTransition\.None|ExitTransition\.None|\bstack\w*\(""")

    internal fun localTransitions(source: String): List<Int> =
        transition.findAll(source)
            .filterNot { delegated.containsMatchIn(source.substring(it.range.last + 1, lambdaEnd(source, it.range.last + 1))) }
            .map { match -> source.substring(0, match.range.first).count { it == '\n' } + 1 }
            .toList()

    private fun lambdaEnd(text: String, from: Int): Int {
        var depth = 1
        var index = from
        while (depth > 0 && index < text.length) {
            depth += when (text[index]) {
                '{' -> 1
                '}' -> -1
                else -> 0
            }
            index++
        }
        return index - 1
    }

    private fun graphSources(): List<File> =
        File("src/main/kotlin/me/meeshy/app/navigation/graph").listFiles { file -> file.extension == "kt" }.orEmpty().toList()

    @Test
    fun `l'analyse voit les graphes`() {
        assertThat(graphSources().size).isAtLeast(10)
    }

    @Test
    fun `la regle compte une poussee locale et laisse passer les delegations`() {
        val found = localTransitions(
            """
            composable(
                route = Routes.FEED,
                enterTransition = { FeedOverlayTransition.enter(this) },
                exitTransition = { ExitTransition.None },
                popEnterTransition = { stackPopEnter() },
                popExitTransition = { slideOutHorizontally(tween(300)) { it / 4 } + fadeOut(tween(200)) },
            ) {}
            """.trimIndent(),
        )

        assertThat(found).containsExactly(6)
    }

    @Test
    fun `aucune destination de graphe ne redeclare sa poussee`() {
        val found = graphSources().flatMap { file -> localTransitions(file.readText()).map { "${file.name}:$it" } }

        assertWithMessage(
            "Une transition locale a ete declaree dans un graphe : un ecran empile prend stackEnter/stackExit du NavHost. Sites :\n" +
                found.joinToString("\n"),
        ).that(found.size).isAtMost(CEILING)
    }

    private companion object {
        const val CEILING = 0
    }
}
