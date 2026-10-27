package me.meeshy.app.navigation.graph

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
import me.meeshy.app.profile.UserStatsScreen
import me.meeshy.app.profile.ReportUserScreen
import me.meeshy.app.profile.ReportUserViewModel

/** Contacts, notifications, ma page et signalement ; la fiche d'un tiers vit dans [ProfileNavGraph]. */
internal fun NavGraphBuilder.socialNavGraph(
    navController: NavHostController,
) {
    val openProfile: (String) -> Unit = { userId ->
        if (userId.isNotBlank()) navController.navigate(Routes.profile(userId))
    }
    composable(Routes.CONTACTS) {
        ContactsScreen(onBack = { navController.popBackStack() }, onOpenProfile = openProfile)
    }
    composable(Routes.CONTACTS_DISCOVER) {
        ContactsScreen(
            onBack = { navController.popBackStack() },
            initialTab = me.meeshy.app.contacts.ContactsTab.Discover,
            onOpenProfile = openProfile,
        )
    }
    sheetComposable(Routes.BLOCKED_USERS, navController) { _, dismiss ->
        ContactsScreen(
            onBack = dismiss,
            initialTab = me.meeshy.app.contacts.ContactsTab.Blocked,
            onOpenProfile = rememberProfileOpenerOverSheet(navController),
        )
    }
    composable(Routes.NOTIFICATIONS) {
        NotificationsScreen(
            onBack = { navController.popBackStack() },
            onOpenConversation = { navController.navigate(Routes.chat(it)) },
            onOpenPost = { navController.navigate(Routes.postDetail(it)) },
            onOpenReel = { navController.navigate(Routes.reels(seed = it)) },
            onOpenStory = { navController.navigate(Routes.story(it)) },
            onOpenMood = { navController.navigate(Routes.moodSpotlight(it)) },
            onOpenProfile = { navController.navigate(Routes.profile(it)) },
            onOpenGame = { navController.navigate(GameRoutes.route(it)) },
        )
    }
    composable(ProfileRoutes.OWN) {
        OwnProfileScreen(
            onBack = { navController.popBackStack() },
            onViewPosts = { userId -> navController.navigate(Routes.userPosts(userId)) },
            onOpenFriendRequests = { navController.navigate(FriendRequestsDestinations.ROUTE) },
            onOpenProgression = { navController.navigate(GameRoutes.PROGRESSION) },
            onOpenStats = { navController.navigate(ProfileRoutes.STATS) },
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
    ) { _, dismiss ->
        UserPostsScreen(
            onBack = dismiss,
            onPostClick = { postId -> navController.navigateKeepingSheet(Routes.reels(seed = postId)) },
            onOpenPost = { postId -> navController.navigateKeepingSheet(Routes.postDetail(postId)) },
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
