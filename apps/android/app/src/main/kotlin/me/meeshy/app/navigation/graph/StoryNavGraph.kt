package me.meeshy.app.navigation.graph

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
        ) {
            StoryViewerScreen(
                onClose = { navController.popBackStack() },
                onOpenProfile = { userId -> navController.navigate(Routes.profile(userId)) },
                onEditStory = { storyId -> navController.navigate(Routes.storyComposerEdit(storyId)) },
                onComposeStory = { storyId -> navController.navigate(Routes.storyComposerRecompose(storyId)) },
                // Une story republiée qui n'est plus jouable (expirée, supprimée) ouvre la fiche du post, comme avant le lecteur.
                onStoryMissing = { postId ->
                    navController.navigate(Routes.postDetail(postId)) { popUpTo(Routes.STORY_VIEWER) { inclusive = true } }
                },
            )
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface StoryNavGraphModule {
    @Binds
    @IntoSet
    fun bind(graph: StoryNavGraph): NavGraphContributor
}
