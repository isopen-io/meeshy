package me.meeshy.app.navigation.graph

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.LaunchedEffect
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
import me.meeshy.app.feed.PendingPostDetailScreen
import me.meeshy.app.feed.PostDetailScreen
import me.meeshy.app.feed.PostDetailViewModel
import me.meeshy.app.navigation.FeedArrivalViewModel
import me.meeshy.app.navigation.FeedOverlayTransition
import me.meeshy.app.navigation.MeeshyPinnedStoryBand
import me.meeshy.sdk.model.composer.ComposerOrigin
import me.meeshy.app.navigation.MeeshyStoryRail
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.app.navigation.Routes
import me.meeshy.app.navigation.LegacyStoryComposerRedirect
import me.meeshy.app.navigation.storyDoor
import me.meeshy.app.navigation.navigateKeepingSheet
import me.meeshy.app.navigation.navigateSingleTop
import me.meeshy.app.navigation.popFrom
import me.meeshy.app.navigation.pushFrom
import me.meeshy.app.navigation.setFeedAside
import me.meeshy.app.navigation.sheetComposable
import me.meeshy.app.reels.ReelsScreen
import me.meeshy.app.stories.MyStoriesScreen
import me.meeshy.app.stories.StoriesViewModel
import me.meeshy.app.composer.host.ComposerHostRoute
import me.meeshy.app.composer.host.ComposerHostScreen
import me.meeshy.app.stories.StoryComposerScreen
import me.meeshy.app.stories.StoryComposerSeedAudience
import me.meeshy.app.stories.StoryViewersSheet

/** Flux, enregistres, a proximite, detail de post, Reels et stories. */
internal fun NavGraphBuilder.feedNavGraph(
    navController: NavHostController,
) {
    composable(
        route = Routes.FEED,
        enterTransition = { FeedOverlayTransition.enter(this) },
        exitTransition = { FeedOverlayTransition.exit(this) },
        popExitTransition = { FeedOverlayTransition.popExit(this) },
    ) { entry ->
        // Le retour système quitte le Flux comme le bouton Flux : mis de côté avec son état, il revient à la même
        // place au prochain toucher (#16676). Inscrit avant l'écran : ses propres retours (feuilles, visionneuse) passent d'abord.
        BackHandler(enabled = remember { navController.previousBackStackEntry != null }) { navController.setFeedAside() }
        val arrival: FeedArrivalViewModel = hiltViewModel()
        LaunchedEffect(arrival) {
            if (arrival.consumeComposerRequest()) Routes.composer(ComposerOrigin.FeedComposer)?.let { navController.navigateSingleTop(it) }
        }
        // Une instance pour le rail et le geste « tirer » : tirer le fil recharge aussi les stories (iOS `FeedView`).
        val storiesViewModel: StoriesViewModel = hiltViewModel()
        FeedScreen(
            onPostClick = { postId -> navController.pushFrom(entry, Routes.reels(seed = postId)) },
            onOpenPost = { postId -> navController.pushFrom(entry, Routes.postDetail(postId)) },
            onOpenReels = { navController.pushFrom(entry, Routes.reels()) },
            onOpenNearby = { navController.pushFrom(entry, Routes.NEARBY_DISCOVERY) },
            onOpenProfile = { userId -> navController.pushFrom(entry, Routes.profile(userId)) },
            onOpenHashtag = { tag -> navController.pushFrom(entry, Routes.hashtag(tag)) },
            onResumeStoryDraft = { navController.pushFrom(entry, storyDoor) },
            onOpenComposer = { origin -> Routes.composer(origin)?.let { navController.pushFrom(entry, it) } },
            onRefreshRail = storiesViewModel::refresh,
            storyRail = { MeeshyStoryRail(navController = navController, storiesViewModel = storiesViewModel) },
            pinnedBand = { reveal -> MeeshyPinnedStoryBand(navController, storiesViewModel, reveal) },
        )
    }
    composable(
        route = Routes.HASHTAG_RESULTS,
        arguments = listOf(navArgument(HashtagResultsViewModel.TAG_ARG) { type = NavType.StringType }),
    ) { entry ->
        HashtagResultsScreen(
            onBack = { navController.popFrom(entry) },
            onPostClick = { postId -> navController.pushFrom(entry, Routes.reels(seed = postId)) },
            onOpenPost = { postId -> navController.pushFrom(entry, Routes.postDetail(postId)) },
            onOpenProfile = { userId -> navController.pushFrom(entry, Routes.profile(userId)) },
            onOpenHashtag = { tag -> navController.pushFrom(entry, Routes.hashtag(tag)) },
        )
    }
    composable(
        route = Routes.MOOD_SPOTLIGHT,
        arguments = listOf(navArgument(MoodSpotlightViewModel.STATUS_ID_ARG) { type = NavType.StringType }),
    ) { entry ->
        MoodSpotlightScreen(onClose = { navController.popFrom(entry) })
    }
    sheetComposable(Routes.MY_STORIES, navController) { entry, dismiss ->
        MyStoriesScreen(
            onBack = dismiss,
            onCreateStory = { navController.navigateKeepingSheet(entry, storyDoor) },
            onOpenStory = { userId -> navController.navigateKeepingSheet(entry, Routes.story(userId)) },
            onEditStory = { storyId -> navController.navigateKeepingSheet(entry, Routes.storyComposerEdit(storyId)) },
            onResumeDraft = { navController.navigateKeepingSheet(entry, storyDoor) },
        )
    }
    composable(Routes.SAVED_POSTS) { entry ->
        BookmarksScreen(
            onBack = { navController.popFrom(entry) },
            onPostClick = { postId -> navController.pushFrom(entry, Routes.reels(seed = postId)) },
            onOpenPost = { postId -> navController.pushFrom(entry, Routes.postDetail(postId)) },
            onOpenProfile = { userId -> navController.pushFrom(entry, Routes.profile(userId)) },
            onOpenHashtag = { tag -> navController.pushFrom(entry, Routes.hashtag(tag)) },
        )
    }
    composable(Routes.NEARBY_DISCOVERY) { entry ->
        NearbyScreen(
            onBack = { navController.popFrom(entry) },
            onPostClick = { postId -> navController.pushFrom(entry, Routes.reels(seed = postId)) },
            onOpenPost = { postId -> navController.pushFrom(entry, Routes.postDetail(postId)) },
            onOpenProfile = { userId -> navController.pushFrom(entry, Routes.profile(userId)) },
            onOpenHashtag = { tag -> navController.pushFrom(entry, Routes.hashtag(tag)) },
        )
    }
    // #16676 — le détail d'un post est une FEUILLE, comme sur iOS : le fil, le réel ou le profil restent dessous,
    // la croix ou le glissé vers le bas la referment.
    sheetComposable(
        route = Routes.POST_DETAIL,
        navController = navController,
        arguments = listOf(
            navArgument(PostDetailViewModel.POST_ID_ARG) { type = NavType.StringType },
            navArgument(PostDetailViewModel.SHOW_COMMENTS_ARG) { type = NavType.StringType; nullable = true; defaultValue = null },
            navArgument(PostDetailViewModel.COMMENT_ID_ARG) { type = NavType.StringType; nullable = true; defaultValue = null },
            navArgument(PostDetailViewModel.PARENT_COMMENT_ID_ARG) { type = NavType.StringType; nullable = true; defaultValue = null },
        ),
        deepLinks = (Routes.POST_SHARE_DEEP_LINKS + Routes.STORY_SHARE_DEEP_LINKS.filter { "/story/" !in it }).map { pattern -> navDeepLink { uriPattern = pattern } },
    ) { entry, dismiss ->
        val postId = entry.arguments?.getString(PostDetailViewModel.POST_ID_ARG)
        if (postId != null && OutboxIds.isCmid(postId)) {
            PendingPostDetailScreen(cmid = postId, onBack = dismiss)
            return@sheetComposable
        }
        PostDetailScreen(
            onBack = dismiss,
            onOpenPost = { postId -> navController.pushFrom(entry, Routes.postDetail(postId)) },
            onOpenReel = { postId -> navController.pushFrom(entry, Routes.reels(seed = postId)) },
            onOpenProfile = { userId -> navController.pushFrom(entry, Routes.profile(userId)) },
            onOpenHashtag = { tag -> navController.pushFrom(entry, Routes.hashtag(tag)) },
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
            onClose = { navController.popFrom(entry) },
            onOpenPost = { postId -> navController.pushFrom(entry, Routes.postDetail(postId)) },
            onOpenProfile = { userId -> navController.pushFrom(entry, Routes.profile(userId)) },
            onOpenStory = { userId -> navController.pushFrom(entry, Routes.story(userId)) },
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
        ComposerHostScreen(onClose = { navController.popFrom(entry) }, feedOwner = feedOwner)
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
            navArgument(Routes.STORY_COMPOSER_EDIT_ARG) {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
            navArgument(Routes.STORY_COMPOSER_RECOMPOSE_ARG) {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
        ),
    ) { entry ->
        val repostOfId = entry.arguments?.getString(Routes.STORY_COMPOSER_REPOST_ARG)
        val audienceArg = entry.arguments?.getString(Routes.STORY_COMPOSER_AUDIENCE_ARG)
        val editStoryId = entry.arguments?.getString(Routes.STORY_COMPOSER_EDIT_ARG)
        val recomposeStoryId = entry.arguments?.getString(Routes.STORY_COMPOSER_RECOMPOSE_ARG)
        val host = remember(entry) { LegacyStoryComposerRedirect.target(repostOfId, audienceArg, editStoryId, recomposeStoryId) }
        if (host != null) {
            LaunchedEffect(host) { navController.navigateSingleTop(host) { popUpTo(Routes.STORY_COMPOSER_ROUTE) { inclusive = true } } }
        } else {
            StoryComposerScreen(
                onClose = { navController.popFrom(entry) },
                repostOfId = repostOfId,
                initialVisibility = StoryComposerSeedAudience.fromRouteArg(audienceArg),
                editStoryId = editStoryId,
                recomposeStoryId = recomposeStoryId,
            )
        }
    }
}
