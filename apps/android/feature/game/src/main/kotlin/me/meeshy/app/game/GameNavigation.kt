package me.meeshy.app.game

import me.meeshy.sdk.model.game.GameNavigationMap
import me.meeshy.sdk.model.game.GameRoute

/** Le graphe du jeu assemblé : une destination par motif de route, chacune rangée à son niveau (1 à 3). */
class GameGraph internal constructor(val destinations: List<GameDestination>) {
    fun find(pattern: String): GameDestination? = destinations.firstOrNull { it.pattern == pattern }

    fun levelOf(pattern: String): Int? = find(pattern)?.let { GameNavigationMap.level(it.route) }
}

/**
 * Construit le graphe depuis les contributeurs injectés (`gameGraph(contributors)`). Deux contributeurs ne peuvent
 * pas se disputer un motif : le second est refusé à l'assemblage, jamais écrasé en silence.
 */
fun gameGraph(contributors: Set<GameDestinationContributor>): GameGraph {
    val builder = GameGraphBuilder()
    contributors.forEach { it.contribute(builder) }
    val destinations = builder.build()
    val duplicate = destinations.groupBy { it.pattern }.entries.firstOrNull { it.value.size > 1 }
    require(duplicate == null) { "Deux écrans du jeu déclarent la même route : ${duplicate?.key}" }
    return GameGraph(destinations)
}

/** Les routes du jeu qu'un graphe doit couvrir pour qu'aucune entrée extérieure ne tombe dans le vide. */
fun GameGraph.missing(required: Collection<GameRoute>): List<GameRoute> =
    required.filter { route -> destinations.none { it.route == route } }
