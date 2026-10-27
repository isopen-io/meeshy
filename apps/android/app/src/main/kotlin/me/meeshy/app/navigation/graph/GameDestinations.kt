package me.meeshy.app.navigation.graph

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.runtime.LaunchedEffect
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.game.progression.ProgressionConceptScreen
import me.meeshy.app.game.progression.ProgressionScreen
import me.meeshy.sdk.model.game.progression.ProgressionConcept

/** Les routes du jeu : la première page « Progression » et la fiche d'un concept (iOS `Route.progression`, `.progressionConcept`). */
object GameRoutes {
    const val CONCEPT_ARG = "concept"

    const val PROGRESSION = "progression"
    const val CONCEPT = "progression/{$CONCEPT_ARG}"

    /** Le lien profond de la première page (iOS `RootView` : `progression`). */
    val PROGRESSION_DEEP_LINKS: List<String> = listOf("meeshy://$PROGRESSION")

    fun concept(concept: ProgressionConcept): String = "$PROGRESSION/${concept.wire}"
}

/**
 * Les destinations du jeu, contribuées au `NavHost` racine sans éditer `MeeshyApp` : l'entrée des Réglages (Outils)
 * ouvre la première page, dont chaque carte pousse la fiche de son concept dans la pile — la fiche reçoit le retour
 * système et le glissement depuis le bord, comme le push d'iOS.
 */
class GameDestinations @Inject constructor() : NavGraphContributor {
    override fun contribute(builder: NavGraphBuilder, navController: NavHostController) {
        builder.composable(
            route = GameRoutes.PROGRESSION,
            deepLinks = GameRoutes.PROGRESSION_DEEP_LINKS.map { pattern -> navDeepLink { uriPattern = pattern } },
            enterTransition = { slideInHorizontally(tween(PUSH_MILLIS)) { it / 4 } + fadeIn(tween(PUSH_MILLIS)) },
            exitTransition = { slideOutHorizontally(tween(PUSH_MILLIS)) { -it / 6 } + fadeOut(tween(FADE_MILLIS)) },
            popEnterTransition = { slideInHorizontally(tween(PUSH_MILLIS)) { -it / 6 } + fadeIn(tween(PUSH_MILLIS)) },
            popExitTransition = { slideOutHorizontally(tween(PUSH_MILLIS)) { it / 4 } + fadeOut(tween(FADE_MILLIS)) },
        ) {
            ProgressionScreen(
                onBack = { navController.popBackStack() },
                onOpenConcept = { navController.navigate(GameRoutes.concept(it)) },
            )
        }
        builder.composable(
            route = GameRoutes.CONCEPT,
            arguments = listOf(navArgument(GameRoutes.CONCEPT_ARG) { type = NavType.StringType }),
            enterTransition = { slideInHorizontally(tween(PUSH_MILLIS)) { it / 4 } + fadeIn(tween(PUSH_MILLIS)) },
            exitTransition = { slideOutHorizontally(tween(PUSH_MILLIS)) { -it / 6 } + fadeOut(tween(FADE_MILLIS)) },
            popEnterTransition = { slideInHorizontally(tween(PUSH_MILLIS)) { -it / 6 } + fadeIn(tween(PUSH_MILLIS)) },
            popExitTransition = { slideOutHorizontally(tween(PUSH_MILLIS)) { it / 4 } + fadeOut(tween(FADE_MILLIS)) },
        ) { entry ->
            val concept = ProgressionConcept.fromWire(entry.arguments?.getString(GameRoutes.CONCEPT_ARG))
            if (concept == null) {
                LaunchedEffect(Unit) { navController.popBackStack() }
            } else {
                ProgressionConceptScreen(
                    concept = concept,
                    onBack = { navController.popBackStack() },
                    onOpenConcept = { navController.navigate(GameRoutes.concept(it)) },
                )
            }
        }
    }

    private companion object {
        const val PUSH_MILLIS = 280
        const val FADE_MILLIS = 180
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface GameDestinationsModule {
    @Binds
    @IntoSet
    fun bind(contributor: GameDestinations): NavGraphContributor
}
