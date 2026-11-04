package me.meeshy.app.game

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds
import me.meeshy.sdk.model.game.GameRoute

/**
 * Le contrat d'un écran du jeu : chaque écran livre SON fichier qui déclare sa destination, et le graphe du jeu
 * s'assemble depuis l'ensemble injecté — ajouter un écran ne réédite aucun câblage.
 */
interface GameDestinationContributor {
    fun contribute(graph: GameGraphBuilder)
}

/** Une destination déclarée : son motif de route et la route pure du jeu dont elle tient la place. */
data class GameDestination(val pattern: String, val route: GameRoute)

class GameGraphBuilder {
    private val collected = mutableListOf<GameDestination>()

    fun destination(pattern: String, route: GameRoute) {
        collected += GameDestination(pattern, route)
    }

    internal fun build(): List<GameDestination> = collected.toList()
}

@Module
@InstallIn(SingletonComponent::class)
internal interface GameDestinationContributorsModule {
    @Multibinds
    fun contributors(): Set<@JvmSuppressWildcards GameDestinationContributor>
}
