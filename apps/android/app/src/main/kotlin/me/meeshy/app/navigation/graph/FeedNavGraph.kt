package me.meeshy.app.navigation.graph

import androidx.compose.runtime.remember
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import me.meeshy.app.feed.BookmarksScreen
import me.meeshy.app.feed.FeedScreen
import me.meeshy.app.feed.HashtagResultsScreen
import me.meeshy.app.feed.HashtagResultsViewModel
import me.meeshy.app.feed.MoodSpotlightScreen
import me.meeshy.app.feed.MoodSpotlightViewModel
import me.meeshy.app.feed.NearbyScreen
import me.meeshy.app.feed.PostDetailScreen
import me.meeshy.app.feed.PostDetailViewModel
import me.meeshy.app.navigation.MeeshyStoryRail
import me.meeshy.app.navigation.Routes
import me.meeshy.app.navigation.storyDoor
import me.meeshy.app.navigation.navigateKeepingSheet
import me.meeshy.app.navigation.sheetComposable
import me.meeshy.app.reels.ReelsScreen
import me.meeshy.app.stories.MyStoriesScreen
import me.meeshy.app.stories.StoriesViewModel
import me.meeshy.app.composer.host.ComposerHostRoute
import me.meeshy.app.composer.host.ComposerHostScreen
import me.meeshy.app.stories.StoryComposerScreen
import me.meeshy.app.stories.StoryComposerSeedAudience
import me.meeshy.app.stories.StoryViewersSheet
import me.meeshy.app.stories.StoryViewerScreen
import me.meeshy.app.stories.StoryViewerViewModel

/** Flux, enregistres, a proximite, detail de post, Reels et stories. */
internal fun NavGraphBuilder.feedNavGraph(
    navController: NavHostController,
) {
    composable(Routes.FEED) {
        // Une instance pour le rail et le geste « tirer » : tirer le fil recharge aussi les stories (iOS `FeedView`).
        val storiesViewModel: StoriesViewModel = hiltViewModel()
        FeedScreen(
            onPostClick = { postId -> navController.navigate(Routes.reels(seed = postId)) },
            onOpenPost = { postId -> navController.navigate(Routes.postDetail(postId)) },
            onOpenReels = { navController.navigate(Routes.reels()) },
            onOpenNearby = { navController.navigate(Routes.NEARBY_DISCOVERY) },
            onOpenProfile = { userId -> navController.navigate(Routes.profile(userId)) },
            onOpenHashtag = { tag -> navController.navigate(Routes.hashtag(tag)) },
            onResumeStoryDraft = { navController.navigate(storyDoor) },
            onOpenComposer = { origin -> Routes.composer(origin)?.let(navController::navigate) },
            onRefreshRail = storiesViewModel::refresh,
            storyRail = { MeeshyStoryRail(navController = navController, storiesViewModel = storiesViewModel) },
        )
    }
    composable(
        route = Routes.HASHTAG_RESULTS,
        arguments = listOf(navArgument(HashtagResultsViewModel.TAG_ARG) { type = NavType.StringType }),
    ) {
        HashtagResultsScreen(
            onBack = { navController.popBackStack() },
            onPostClick = { postId -> navController.navigate(Routes.reels(seed = postId)) },
            onOpenPost = { postId -> navController.navigate(Routes.postDetail(postId)) },
            onOpenProfile = { userId -> navController.navigate(Routes.profile(userId)) },
            onOpenHashtag = { tag -> navController.navigate(Routes.hashtag(tag)) },
        )
    }
    composable(
        route = Routes.MOOD_SPOTLIGHT,
        arguments = listOf(navArgument(MoodSpotlightViewModel.STATUS_ID_ARG) { type = NavType.StringType }),
    ) {
        MoodSpotlightScreen(onClose = { navController.popBackStack() })
    }
    sheetComposable(Routes.MY_STORIES, navController) { _, dismiss ->
        MyStoriesScreen(
            onBack = dismiss,
            onCreateStory = { navController.navigateKeepingSheet(storyDoor) },
            onOpenStory = { userId -> navController.navigateKeepingSheet(Routes.story(userId)) },
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
        deepLinks = (Routes.POST_SHARE_DEEP_LINKS + Routes.STORY_SHARE_DEEP_LINKS).map { pattern -> navDeepLink { uriPattern = pattern } },
    ) {
        PostDetailScreen(
            onBack = { navController.popBackStack() },
            onOpenPost = { postId -> navController.navigate(Routes.postDetail(postId)) },
            onOpenProfile = { userId -> navController.navigate(Routes.profile(userId)) },
            onOpenHashtag = { tag -> navController.navigate(Routes.hashtag(tag)) },
            viewersSheet = { postId, onDismiss ->
                StoryViewersSheet(storyId = postId, accentHex = "6366F1", onDismiss = onDismiss)
            },
        )
    }
    composable(
        route = Routes.REELS,
        arguments = listOf(
            navArgument("seed") { type = NavType.StringType; nullable = true; defaultValue = null },
        ),
        deepLinks = Routes.REEL_SHARE_DEEP_LINKS.map { pattern -> navDeepLink { uriPattern = pattern } },
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
            onOpenProfile = { userId -> navController.navigate(Routes.profile(userId)) },
        )
    }
    composable(
        route = Routes.COMPOSER,
        arguments = listOf(
            navArgument(ComposerHostRoute.ORIGIN_ARG) {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
            navArgument(ComposerHostRoute.ID_ARG) {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
            navArgument(ComposerHostRoute.SUB_ARG) {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
            navArgument(ComposerHostRoute.SEED_ARG) {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
        ),
    ) { entry ->
        // The feed's entry, when it is under the host: its ViewModels are SHARED, never re-created.
        val feedOwner = remember(entry) { runCatching { navController.getBackStackEntry(Routes.FEED) }.getOrNull() }
        ComposerHostScreen(onClose = { navController.popBackStack() }, feedOwner = feedOwner)
    }
    composable(
        route = Routes.STORY_COMPOSER_ROUTE,
        arguments = listOf(
            navArgument(Routes.STORY_COMPOSER_REPOST_ARG) {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
            navArgument(Routes.STORY_COMPOSER_AUDIENCE_ARG) {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
        ),
    ) { entry ->
        StoryComposerScreen(
            onClose = { navController.popBackStack() },
            repostOfId = entry.arguments?.getString(Routes.STORY_COMPOSER_REPOST_ARG),
            initialVisibility = StoryComposerSeedAudience.fromRouteArg(entry.arguments?.getString(Routes.STORY_COMPOSER_AUDIENCE_ARG)),
        )
    }
}
