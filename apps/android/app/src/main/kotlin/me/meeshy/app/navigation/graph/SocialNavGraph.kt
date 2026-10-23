package me.meeshy.app.navigation.graph

import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import me.meeshy.app.contacts.ContactsScreen
import me.meeshy.app.feed.UserPostsScreen
import me.meeshy.app.navigation.Routes
import me.meeshy.app.notifications.NotificationsScreen
import me.meeshy.app.profile.ProfileScreen
import me.meeshy.app.profile.ReportUserScreen
import me.meeshy.app.profile.ReportUserViewModel

/** Contacts, notifications, profils et signalement. */
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
    composable(Routes.BLOCKED_USERS) {
        ContactsScreen(
            onBack = { navController.popBackStack() },
            initialTab = me.meeshy.app.contacts.ContactsTab.Blocked,
            onOpenProfile = openProfile,
        )
    }
    composable(Routes.NOTIFICATIONS) {
        NotificationsScreen(
            onOpenConversation = { navController.navigate(Routes.chat(it)) },
            onOpenPost = { navController.navigate(Routes.postDetail(it)) },
            onOpenReel = { navController.navigate(Routes.reels(seed = it)) },
            onOpenStory = { navController.navigate(Routes.story(it)) },
            onOpenProfile = { navController.navigate(Routes.profile(it)) },
        )
    }
    composable(
        route = Routes.PROFILE_USER,
        arguments = listOf(navArgument("userId") { type = NavType.StringType }),
        deepLinks = listOf(
            navDeepLink { uriPattern = Routes.PROFILE_DEEP_LINK },
            navDeepLink { uriPattern = Routes.PROFILE_SHARE_APP_DEEP_LINK },
            navDeepLink { uriPattern = Routes.PROFILE_SHARE_WEB_DEEP_LINK },
        ),
    ) {
        ProfileScreen(
            onBack = { navController.popBackStack() },
            onReport = { userId, username ->
                navController.navigate(Routes.reportUser(userId, username))
            },
            onViewPosts = { userId -> navController.navigate(Routes.userPosts(userId)) },
            onOpenConversation = { conversationId -> navController.navigate(Routes.chat(conversationId)) },
        )
    }
    composable(
        route = Routes.USER_POSTS,
        arguments = listOf(navArgument("userId") { type = NavType.StringType }),
    ) {
        UserPostsScreen(
            onBack = { navController.popBackStack() },
            onPostClick = { postId -> navController.navigate(Routes.reels(seed = postId)) },
            onOpenPost = { postId -> navController.navigate(Routes.postDetail(postId)) },
        )
    }
    composable(
        route = Routes.REPORT_USER,
        arguments = listOf(
            navArgument(ReportUserViewModel.USER_ID_ARG) { type = NavType.StringType },
            navArgument(ReportUserViewModel.USERNAME_ARG) {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
        ),
    ) {
        ReportUserScreen(onDone = { navController.popBackStack() })
    }
}
