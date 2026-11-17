package me.meeshy.app.navigation.graph

import me.meeshy.app.navigation.navigateSingleTop
import me.meeshy.app.navigation.popFrom
import me.meeshy.app.navigation.pushFrom
import androidx.navigation.NavBackStackEntry
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
import me.meeshy.app.navigation.Routes
import me.meeshy.app.navigation.storyDoor
import me.meeshy.app.stories.StoryNotificationTargetArgs
import me.meeshy.app.stories.StoryNotificationTargetScreen
import me.meeshy.app.stories.StoryViewerScreen
import me.meeshy.app.stories.StoryViewerViewModel

/**
 * Propriétaire : lot story-viewer-decomposition-and-nav-graph. Les destinations du lecteur de stories :
 * `story/{userId}?storyId=` et le lien profond `meeshy://story/{userId}`, inchangés. Un lot qui ajoute une
 * destination de story (lecteur de groupe, aperçu) la déclare ICI, jamais dans `FeedNavGraph` ni `MeeshyApp`.
 */
class StoryNavGraph @Inject constructor() : NavGraphContributor {
    override fun contribute(builder: NavGraphBuilder, navController: NavHostController) {
        builder.composable(
            route = Routes.STORY_VIEWER,
            arguments = listOf(
                navArgument(StoryViewerViewModel.USER_ID_ARG) { type = NavType.StringType },
                navArgument(StoryViewerViewModel.STORY_ID_ARG) {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
            ),
            deepLinks = listOf(
                navDeepLink { uriPattern = Routes.STORY_DEEP_LINK },
            ),
        ) { entry ->
            StoryViewerHost(navController, entry)
        }
        builder.composable(
            route = StoryRoutes.STORY_POST,
            arguments = listOf(
                navArgument(StoryViewerViewModel.STORY_ID_ARG) { type = NavType.StringType },
                navArgument(StoryViewerViewModel.ACTION_ARG) { type = NavType.StringType; nullable = true; defaultValue = null },
                navArgument(StoryViewerViewModel.COMMENT_ID_ARG) { type = NavType.StringType; nullable = true; defaultValue = null },
                navArgument(StoryViewerViewModel.PARENT_COMMENT_ID_ARG) { type = NavType.StringType; nullable = true; defaultValue = null },
            ),
            deepLinks = StoryRoutes.STORY_LINKS.map { pattern -> navDeepLink { uriPattern = pattern } },
        ) { entry ->
            StoryViewerHost(navController, entry)
        }
        builder.composable(
            route = StoryRoutes.STORY_TARGET,
            arguments = listOf(navArgument(StoryNotificationTargetArgs.STORY_ID) { type = NavType.StringType }) +
                StoryRoutes.TARGET_ARGS.map { name -> navArgument(name) { type = NavType.StringType; nullable = true; defaultValue = null } },
        ) { entry ->
            StoryNotificationTargetHost(navController, entry)
        }
    }
}

/** Une story lisible remplace cet écran par le lecteur (retour = la liste des notifications, pas l'écran cible). */
@androidx.compose.runtime.Composable
private fun StoryNotificationTargetHost(navController: NavHostController, entry: NavBackStackEntry) {
    StoryNotificationTargetScreen(
        onClose = { navController.popFrom(entry) },
        onOpenViewer = { open ->
            navController.navigateSingleTop(StoryRoutes.storyPost(open.storyId, open.action, open.commentId, open.parentCommentId)) {
                popUpTo(entry.destination.id) { inclusive = true }
            }
        },
        onCreateStory = {
            navController.pushFrom(entry, storyDoor) { popUpTo(entry.destination.id) { inclusive = true } }
        },
    )
}

@androidx.compose.runtime.Composable
private fun StoryViewerHost(navController: NavHostController, entry: NavBackStackEntry) {
    StoryViewerScreen(
        onClose = { navController.popFrom(entry) },
        onOpenProfile = { userId -> navController.pushFrom(entry, Routes.profile(userId)) },
        onEditStory = { storyId -> navController.pushFrom(entry, Routes.storyComposerEdit(storyId)) },
        onComposeStory = { storyId -> navController.pushFrom(entry, Routes.storyComposerRecompose(storyId)) },
        // Une story republiée qui n'est plus jouable (expirée, supprimée) ouvre la fiche du post, comme avant le lecteur.
        onStoryMissing = { postId ->
            navController.navigateSingleTop(Routes.postDetail(postId)) { popUpTo(entry.destination.id) { inclusive = true } }
        },
    )
}

@Module
@InstallIn(SingletonComponent::class)
internal interface StoryNavGraphModule {
    @Binds
    @IntoSet
    fun bind(graph: StoryNavGraph): NavGraphContributor
}
