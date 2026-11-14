package me.meeshy.app.navigation.graph

import me.meeshy.app.navigation.popFrom
import me.meeshy.app.navigation.pushFrom
import me.meeshy.app.navigation.rememberConversationOpener
import androidx.compose.runtime.remember
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import me.meeshy.app.contacts.ContactsScreen
import me.meeshy.app.feed.UserPostsScreen
import me.meeshy.app.navigation.ProfileRoutes
import me.meeshy.app.navigation.Routes
import me.meeshy.app.navigation.navigateKeepingSheet
import me.meeshy.app.navigation.rememberProfileOpenerOverSheet
import me.meeshy.app.navigation.sheetComposable
import me.meeshy.app.notifications.NotificationsScreen
import me.meeshy.app.profile.OwnProfileScreen
import me.meeshy.app.profile.ProfileDecorSheet
import me.meeshy.app.profile.UserStatsScreen
import me.meeshy.app.profile.ReportUserScreen
import me.meeshy.app.profile.ReportUserViewModel

/** Contacts, notifications, ma page et signalement ; la fiche d'un tiers vit dans [ProfileNavGraph]. */
internal fun NavGraphBuilder.socialNavGraph(
    navController: NavHostController,
) {
    composable(Routes.CONTACTS) { entry ->
        ContactsScreen(onBack = { navController.popFrom(entry) }, onOpenProfile = rememberProfileOpenerOverSheet(navController))
    }
    composable(Routes.CONTACTS_DISCOVER) { entry ->
        ContactsScreen(
            onBack = { navController.popFrom(entry) },
            initialTab = me.meeshy.app.contacts.ContactsTab.Discover,
            onOpenProfile = rememberProfileOpenerOverSheet(navController),
        )
    }
    sheetComposable(Routes.BLOCKED_USERS, navController) { _, dismiss ->
        ContactsScreen(
            onBack = dismiss,
            initialTab = me.meeshy.app.contacts.ContactsTab.Blocked,
            onOpenProfile = rememberProfileOpenerOverSheet(navController),
        )
    }
    composable(Routes.NOTIFICATIONS) { entry ->
        val openConversation = rememberConversationOpener(navController, entry)
        NotificationsScreen(
            onBack = { navController.popFrom(entry) },
            onOpenConversation = { openConversation(it, null) },
            onOpenPost = { navController.pushFrom(entry, Routes.postDetail(it)) },
            onOpenReel = { navController.pushFrom(entry, Routes.reels(seed = it)) },
            onOpenStory = { navController.pushFrom(entry, Routes.story(it)) },
            onOpenMood = { navController.pushFrom(entry, Routes.moodSpotlight(it)) },
            onOpenProfile = rememberProfileOpenerOverSheet(navController),
            onOpenGame = { navController.pushFrom(entry, GameRoutes.route(it)) },
            onOpenStoryContent = { target, context ->
                navController.pushFrom(entry, StoryRoutes.storyTarget(target.postId, target.action, target.commentId, target.parentCommentId, context))
            },
        )
    }
    composable(ProfileRoutes.OWN) { entry ->
        OwnProfileScreen(
            onBack = { navController.popFrom(entry) },
            onViewPosts = { userId -> navController.pushFrom(entry, Routes.userPosts(userId)) },
            onOpenFriendRequests = { navController.pushFrom(entry, FriendRequestsDestinations.ROUTE) },
            onOpenProgression = { navController.pushFrom(entry, GameRoutes.PROGRESSION) },
            onOpenStats = { navController.pushFrom(entry, ProfileRoutes.STATS) },
            onOpenDecor = { navController.pushFrom(entry, ProfileRoutes.DECOR) },
        )
    }
    // iOS présente `ProfileDecorSheet` en `.sheet` depuis ma page : « Terminé » + glissé vers le bas (#13364).
    // La photo de bannière choisie ici est téléversée par le téléverseur de MA PAGE (celui que la page affiche) :
    // fermer la feuille pendant l'envoi ne l'annule pas, et la page garde l'indicateur et l'erreur.
    sheetComposable(ProfileRoutes.DECOR, navController) { entry, dismiss ->
        val page = remember(entry) { runCatching { navController.getBackStackEntry(ProfileRoutes.OWN) }.getOrNull() }
        ProfileDecorSheet(
            onDone = dismiss,
            uploadViewModel = if (page != null) hiltViewModel(page) else hiltViewModel(),
            onOpenShop = { domain -> navController.pushFrom(entry, Routes.packShop(domain = domain.wire)) },
        )
    }
    // iOS présente `UserStatsView` en `.sheet` depuis ma page et les Réglages : croix + glissé vers le bas (#13364).
    sheetComposable(ProfileRoutes.STATS, navController) { _, dismiss ->
        UserStatsScreen(onBack = dismiss)
    }
    sheetComposable(
        route = Routes.USER_POSTS,
        navController = navController,
        arguments = listOf(navArgument("userId") { type = NavType.StringType }),
    ) { entry, dismiss ->
        UserPostsScreen(
            onBack = dismiss,
            onPostClick = { postId -> navController.navigateKeepingSheet(entry, Routes.reels(seed = postId)) },
            onOpenPost = { postId -> navController.navigateKeepingSheet(entry, Routes.postDetail(postId)) },
            onOpenProfile = { userId -> navController.navigateKeepingSheet(entry, Routes.profile(userId)) },
            onOpenHashtag = { tag -> navController.navigateKeepingSheet(entry, Routes.hashtag(tag)) },
        )
    }
    sheetComposable(
        route = Routes.REPORT_USER,
        navController = navController,
        arguments = listOf(
            navArgument(ReportUserViewModel.USER_ID_ARG) { type = NavType.StringType },
            navArgument(ReportUserViewModel.USERNAME_ARG) {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
        ),
    ) { _, dismiss ->
        ReportUserScreen(onDone = dismiss)
    }
}
