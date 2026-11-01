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
import me.meeshy.app.game.notebook.GameNotebookScreen
import me.meeshy.app.game.pages.AtlasScreen
import me.meeshy.app.game.pages.GameSettingsScreen
import me.meeshy.app.game.pages.LeagueScreen
import me.meeshy.app.game.pages.PrestigeScreen
import me.meeshy.app.game.pages.SeasonScreen
import me.meeshy.app.game.progression.GameRulesScreen
import me.meeshy.app.game.progression.GameRulesSection
import me.meeshy.app.game.pages.ShowcaseScreen
import me.meeshy.app.game.progression.ProgressionConceptScreen
import me.meeshy.app.game.progression.ProgressionScreen
import me.meeshy.app.game.progression.ProgressionSection
import me.meeshy.app.game.progression.ProgressionSectionScreen
import me.meeshy.app.navigation.Routes
import me.meeshy.sdk.model.game.GameTarget
import me.meeshy.sdk.model.game.pages.GamePage
import me.meeshy.sdk.model.game.progression.ProgressionConcept

/** Les routes du jeu : la première page « Progression » et la fiche d'un concept (iOS `Route.progression`, `.progressionConcept`). */
object GameRoutes {
    const val CONCEPT_ARG = "concept"

    const val PROGRESSION = "progression"
    const val CONCEPT = "progression/{$CONCEPT_ARG}"

    const val PAGE_ARG = "page"
    const val PAGE = "progression/page/{$PAGE_ARG}"

    const val SECTION_ARG = "section"
    const val SECTION = "progression/section/{$SECTION_ARG}"

    /** La Chronique (iOS `Route.progressionNotebook`) : les étapes du jeu qui attendent leur photo. */
    const val NOTEBOOK = "progression/notebook"

    const val RULES_ARG = "rules"
    const val RULES = "progression/rules/{$RULES_ARG}"
    private const val RULES_TOP_ARG = "top"

    /** Le lien profond de la première page (iOS `RootView` : `progression`). */
    val PROGRESSION_DEEP_LINKS: List<String> = listOf("meeshy://$PROGRESSION")

    fun concept(concept: ProgressionConcept): String = "$PROGRESSION/${concept.wire}"

    /** Une sous-page du jeu (iOS `Route.gamePage`) : Ligue, Voyage, Vitrine, Atlas, Renaissance, Réglages. */
    fun page(page: GamePage): String = "$PROGRESSION/page/${page.wire}"

    /** Une section d'une fiche (iOS `Route.progressionSection`) : la page des hauts faits ; son parent est la fiche. */
    fun section(section: ProgressionSection): String = "$PROGRESSION/section/${section.wire}"

    /** Le carnet des règles ouvert à une section (iOS `Route.progressionRules`) : « Comprendre les médailles ». */
    fun rules(section: GameRulesSection): String = "$PROGRESSION/rules/${section.wire}"

    /** « Comment ça marche » de la première page (iOS `onOpenRules(nil)`) : le carnet ouvert en haut, sans section visée. */
    const val RULES_TOP: String = "$PROGRESSION/rules/$RULES_TOP_ARG"

    /** La route d'un écran du jeu ouvert par une entrée extérieure (notification) : [GameTarget]. */
    fun route(target: GameTarget): String = when (target) {
        GameTarget.Home -> PROGRESSION
        is GameTarget.Concept -> concept(target.concept)
        is GameTarget.Page -> page(target.page)
    }
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
                onOpenSettings = { navController.navigate(GameRoutes.page(GamePage.Settings)) },
                onOpenRules = { navController.navigate(GameRoutes.RULES_TOP) },
                onOpenNotebook = { navController.navigate(GameRoutes.NOTEBOOK) },
                onOpenConversations = {
                    if (!navController.popBackStack(Routes.CONVERSATIONS, inclusive = false)) navController.navigate(Routes.CONVERSATIONS)
                },
            )
        }
        builder.composable(
            route = GameRoutes.NOTEBOOK,
            enterTransition = { slideInHorizontally(tween(PUSH_MILLIS)) { it / 4 } + fadeIn(tween(PUSH_MILLIS)) },
            exitTransition = { slideOutHorizontally(tween(PUSH_MILLIS)) { -it / 6 } + fadeOut(tween(FADE_MILLIS)) },
            popEnterTransition = { slideInHorizontally(tween(PUSH_MILLIS)) { -it / 6 } + fadeIn(tween(PUSH_MILLIS)) },
            popExitTransition = { slideOutHorizontally(tween(PUSH_MILLIS)) { it / 4 } + fadeOut(tween(FADE_MILLIS)) },
        ) {
            GameNotebookScreen(onBack = { navController.popBackStack() })
        }
        builder.composable(
            route = GameRoutes.PAGE,
            arguments = listOf(navArgument(GameRoutes.PAGE_ARG) { type = NavType.StringType }),
            enterTransition = { slideInHorizontally(tween(PUSH_MILLIS)) { it / 4 } + fadeIn(tween(PUSH_MILLIS)) },
            exitTransition = { slideOutHorizontally(tween(PUSH_MILLIS)) { -it / 6 } + fadeOut(tween(FADE_MILLIS)) },
            popEnterTransition = { slideInHorizontally(tween(PUSH_MILLIS)) { -it / 6 } + fadeIn(tween(PUSH_MILLIS)) },
            popExitTransition = { slideOutHorizontally(tween(PUSH_MILLIS)) { it / 4 } + fadeOut(tween(FADE_MILLIS)) },
        ) { entry ->
            val page = GamePage.fromWire(entry.arguments?.getString(GameRoutes.PAGE_ARG))
            val back: () -> Unit = { navController.popBackStack() }
            when (page) {
                GamePage.League -> LeagueScreen(onBack = back)
                GamePage.Season -> SeasonScreen(onBack = back)
                GamePage.Showcase -> ShowcaseScreen(onBack = back)
                GamePage.Atlas -> AtlasScreen(onBack = back)
                GamePage.Prestige -> PrestigeScreen(onBack = back)
                GamePage.Settings -> GameSettingsScreen(onBack = back)
                null -> LaunchedEffect(Unit) { navController.popBackStack() }
            }
        }
        builder.composable(
            route = GameRoutes.SECTION,
            arguments = listOf(navArgument(GameRoutes.SECTION_ARG) { type = NavType.StringType }),
            enterTransition = { slideInHorizontally(tween(PUSH_MILLIS)) { it / 4 } + fadeIn(tween(PUSH_MILLIS)) },
            exitTransition = { slideOutHorizontally(tween(PUSH_MILLIS)) { -it / 6 } + fadeOut(tween(FADE_MILLIS)) },
            popEnterTransition = { slideInHorizontally(tween(PUSH_MILLIS)) { -it / 6 } + fadeIn(tween(PUSH_MILLIS)) },
            popExitTransition = { slideOutHorizontally(tween(PUSH_MILLIS)) { it / 4 } + fadeOut(tween(FADE_MILLIS)) },
        ) { entry ->
            val section = ProgressionSection.fromWire(entry.arguments?.getString(GameRoutes.SECTION_ARG))
            if (section == null) {
                LaunchedEffect(Unit) { navController.popBackStack() }
            } else {
                ProgressionSectionScreen(
                    section = section,
                    onBack = { navController.popBackStack() },
                    onOpenBadgesGuide = { navController.openBadgesGuide() },
                )
            }
        }
        builder.composable(
            route = GameRoutes.RULES,
            arguments = listOf(navArgument(GameRoutes.RULES_ARG) { type = NavType.StringType }),
            enterTransition = { slideInHorizontally(tween(PUSH_MILLIS)) { it / 4 } + fadeIn(tween(PUSH_MILLIS)) },
            exitTransition = { slideOutHorizontally(tween(PUSH_MILLIS)) { -it / 6 } + fadeOut(tween(FADE_MILLIS)) },
            popEnterTransition = { slideInHorizontally(tween(PUSH_MILLIS)) { -it / 6 } + fadeIn(tween(PUSH_MILLIS)) },
            popExitTransition = { slideOutHorizontally(tween(PUSH_MILLIS)) { it / 4 } + fadeOut(tween(FADE_MILLIS)) },
        ) { entry ->
            GameRulesScreen(
                onBack = { navController.popBackStack() },
                focused = GameRulesSection.fromWire(entry.arguments?.getString(GameRoutes.RULES_ARG)),
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
                    onOpenPage = { navController.navigate(GameRoutes.page(it)) },
                    onOpenSection = { navController.navigate(GameRoutes.section(it)) },
                    onOpenBadgesGuide = { navController.openBadgesGuide() },
                )
            }
        }
    }

    /**
     * « Comprendre les médailles » (iOS `GameNavigationMap.badgesGuide`) : le carnet est une porte de la PREMIÈRE page —
     * son retour y ramène, quelle que soit la fiche ou la section d'où l'on vient.
     */
    private fun NavHostController.openBadgesGuide() {
        navigate(GameRoutes.rules(GameRulesSection.Badges)) {
            popUpTo(GameRoutes.PROGRESSION)
            launchSingleTop = true
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
