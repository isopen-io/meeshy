package me.meeshy.app.navigation.graph

import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import me.meeshy.app.feed.BookmarksScreen
import me.meeshy.app.feed.FeedScreen
import me.meeshy.app.feed.NearbyScreen
import me.meeshy.app.feed.PostDetailScreen
import me.meeshy.app.feed.PostDetailViewModel
import me.meeshy.app.navigation.Routes
import me.meeshy.app.reels.ReelsScreen
import me.meeshy.app.stories.StoryComposerScreen
import me.meeshy.app.stories.StoryViewerScreen
import me.meeshy.app.stories.StoryViewerViewModel

/** Flux, enregistres, a proximite, detail de post, Reels et stories. */
internal fun NavGraphBuilder.feedNavGraph(
    navController: NavHostController,
) {
    composable(Routes.FEED) {
        FeedScreen(
            onPostClick = { postId -> navController.navigate(Routes.reels(seed = postId)) },
            onOpenPost = { postId -> navController.navigate(Routes.postDetail(postId)) },
            onOpenReels = { navController.navigate(Routes.reels()) },
            onOpenNearby = { navController.navigate(Routes.NEARBY_DISCOVERY) },
            onOpenProfile = { userId -> navController.navigate(Routes.profile(userId)) },
        )
    }
    composable(Routes.SAVED_POSTS) {
        BookmarksScreen(
            onBack = { navController.popBackStack() },
            onPostClick = { postId -> navController.navigate(Routes.reels(seed = postId)) },
            onOpenPost = { postId -> navController.navigate(Routes.postDetail(postId)) },
            onOpenProfile = { userId -> navController.navigate(Routes.profile(userId)) },
        )
    }
    composable(Routes.NEARBY_DISCOVERY) {
        NearbyScreen(
            onBack = { navController.popBackStack() },
            onPostClick = { postId -> navController.navigate(Routes.reels(seed = postId)) },
            onOpenPost = { postId -> navController.navigate(Routes.postDetail(postId)) },
            onOpenProfile = { userId -> navController.navigate(Routes.profile(userId)) },
        )
    }
    composable(
        route = Routes.POST_DETAIL,
        arguments = listOf(
            navArgument(PostDetailViewModel.POST_ID_ARG) { type = NavType.StringType },
        ),
        deepLinks = Routes.POST_SHARE_DEEP_LINKS.map { pattern -> navDeepLink { uriPattern = pattern } },
    ) {
        PostDetailScreen(
            onBack = { navController.popBackStack() },
            onOpenPost = { postId -> navController.navigate(Routes.postDetail(postId)) },
            onOpenProfile = { userId -> navController.navigate(Routes.profile(userId)) },
        )
    }
    composable(
        route = Routes.REELS,
        arguments = listOf(
            navArgument("seed") { type = NavType.StringType; nullable = true; defaultValue = null },
        ),
    ) { entry ->
        ReelsScreen(
            seed = entry.arguments?.getString("seed"),
            onClose = { navController.popBackStack() },
            onOpenPost = { postId -> navController.navigate(Routes.postDetail(postId)) },
            onOpenProfile = { userId -> navController.navigate(Routes.profile(userId)) },
        )
    }
    composable(
        route = Routes.STORY_VIEWER,
        arguments = listOf(navArgument(StoryViewerViewModel.USER_ID_ARG) { type = NavType.StringType }),
        deepLinks = listOf(
            navDeepLink { uriPattern = Routes.STORY_DEEP_LINK },
        ),
    ) {
        StoryViewerScreen(
            onClose = { navController.popBackStack() },
            onRepost = { storyId -> navController.navigate(Routes.storyComposerRepost(storyId)) },
        )
    }
    composable(
        route = Routes.STORY_COMPOSER_ROUTE,
        arguments = listOf(
            navArgument(Routes.STORY_COMPOSER_REPOST_ARG) {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
        ),
    ) { entry ->
        StoryComposerScreen(
            onClose = { navController.popBackStack() },
            repostOfId = entry.arguments?.getString(Routes.STORY_COMPOSER_REPOST_ARG),
        )
    }
}
