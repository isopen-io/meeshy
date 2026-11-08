package me.meeshy.app.game

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameRoute
import me.meeshy.sdk.model.game.pages.GamePage
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import org.junit.Assert.assertThrows
import org.junit.Test

class GameNavigationTest {

    private fun contributor(vararg entries: Pair<String, GameRoute>) = object : GameDestinationContributor {
        override fun contribute(graph: GameGraphBuilder) = entries.forEach { (pattern, route) -> graph.destination(pattern, route) }
    }

    @Test
    fun `le graphe agrege les destinations de tous les contributeurs`() {
        val graph = gameGraph(
            setOf(
                contributor("progression" to GameRoute.Progression),
                contributor("progression/page/league" to GameRoute.Page(GamePage.League)),
            ),
        )
        assertThat(graph.destinations.map { it.pattern }).containsExactly("progression", "progression/page/league")
        assertThat(graph.levelOf("progression")).isEqualTo(1)
        assertThat(graph.levelOf("progression/page/league")).isEqualTo(3)
        assertThat(graph.levelOf("absent")).isNull()
    }

    @Test
    fun `sans contributeur le graphe est vide`() {
        assertThat(gameGraph(emptySet()).destinations).isEmpty()
    }

    @Test
    fun `deux contributeurs sur la meme route sont refuses`() {
        val one = contributor("progression" to GameRoute.Progression)
        val two = contributor("progression" to GameRoute.Concept(ProgressionConcept.Level))
        assertThrows(IllegalArgumentException::class.java) { gameGraph(setOf(one, two)) }
    }

    @Test
    fun `le graphe dit quelles routes lui manquent`() {
        val graph = gameGraph(setOf(contributor("progression" to GameRoute.Progression)))
        assertThat(graph.missing(listOf(GameRoute.Progression, GameRoute.Notebook))).containsExactly(GameRoute.Notebook)
    }
}
