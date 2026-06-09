package me.meeshy.app.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.PersonOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.compose.ui.res.stringResource
import me.meeshy.app.R
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.auth.LoginScreen
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.app.chat.ChatScreen
import me.meeshy.app.chat.ChatViewModel
import me.meeshy.app.conversations.ConversationListScreen
import me.meeshy.app.feed.FeedScreen
import me.meeshy.app.notifications.NotificationsScreen
import me.meeshy.app.profile.ProfileScreen

object Routes {
    const val LOGIN = "login"
    const val CONVERSATIONS = "conversations"
    const val CHAT = "chat/{${ChatViewModel.CONVERSATION_ID_ARG}}"
    const val FEED = "feed"
    const val NOTIFICATIONS = "notifications"
    const val PROFILE = "profile"
    const val PROFILE_USER = "profile/{userId}"

    fun chat(conversationId: String): String = "chat/$conversationId"
    fun profile(userId: String): String = "profile/$userId"
}

private data class TabItem(
    val route: String,
    val label: String,
    val selectedIcon: @Composable () -> Unit,
    val unselectedIcon: @Composable () -> Unit,
)

@Composable
private fun rememberTabs(): List<TabItem> {
    val messages = stringResource(R.string.tab_messages)
    val feed = stringResource(R.string.tab_feed)
    val activity = stringResource(R.string.tab_activity)
    val profile = stringResource(R.string.tab_profile)
    return remember(messages, feed, activity, profile) {
        listOf(
            TabItem(
                route = Routes.CONVERSATIONS,
                label = messages,
                selectedIcon = { Icon(Icons.Filled.ChatBubble, contentDescription = messages) },
                unselectedIcon = { Icon(Icons.Outlined.ChatBubbleOutline, contentDescription = messages) },
            ),
            TabItem(
                route = Routes.FEED,
                label = feed,
                selectedIcon = { Icon(Icons.Filled.Home, contentDescription = feed) },
                unselectedIcon = { Icon(Icons.Outlined.Home, contentDescription = feed) },
            ),
            TabItem(
                route = Routes.NOTIFICATIONS,
                label = activity,
                selectedIcon = { Icon(Icons.Filled.Notifications, contentDescription = activity) },
                unselectedIcon = { Icon(Icons.Outlined.Notifications, contentDescription = activity) },
            ),
            TabItem(
                route = Routes.PROFILE,
                label = profile,
                selectedIcon = { Icon(Icons.Filled.Person, contentDescription = profile) },
                unselectedIcon = { Icon(Icons.Outlined.PersonOutline, contentDescription = profile) },
            ),
        )
    }
}

private val tabRoutes = setOf(Routes.CONVERSATIONS, Routes.FEED, Routes.NOTIFICATIONS, Routes.PROFILE)

@Composable
fun MeeshyApp() {
    val navController = rememberNavController()
    val authViewModel: AuthViewModel = hiltViewModel()
    val authState by authViewModel.state.collectAsStateWithLifecycle()

    val navBackStack by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStack?.destination?.route
    val showBottomBar = currentRoute in tabRoutes

    val startDestination = remember(authState.isAuthenticated) { if (authState.isAuthenticated) Routes.CONVERSATIONS else Routes.LOGIN }
    val tabs = rememberTabs()

    Scaffold(
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    tabs.forEach { tab ->
                        val selected = currentRoute == tab.route
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                if (!selected) {
                                    navController.navigate(tab.route) {
                                        popUpTo(navController.graph.startDestinationId) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                }
                            },
                            icon = { if (selected) tab.selectedIcon() else tab.unselectedIcon() },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = startDestination,
            modifier = Modifier.padding(padding),
        ) {
            composable(Routes.LOGIN) {
                LoginScreen(
                    viewModel = authViewModel,
                    onAuthenticated = {
                        navController.navigate(Routes.CONVERSATIONS) {
                            popUpTo(Routes.LOGIN) { inclusive = true }
                        }
                    },
                )
            }
            composable(Routes.CONVERSATIONS) {
                ConversationListScreen(
                    onConversationClick = { conversationId ->
                        navController.navigate(Routes.chat(conversationId))
                    },
                    onLogout = {
                        authViewModel.logout()
                        navController.navigate(Routes.LOGIN) {
                            popUpTo(Routes.CONVERSATIONS) { inclusive = true }
                        }
                    },
                )
            }
            composable(
                route = Routes.CHAT,
                arguments = listOf(
                    navArgument(ChatViewModel.CONVERSATION_ID_ARG) { type = NavType.StringType },
                ),
            ) {
                ChatScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.FEED) {
                FeedScreen(
                    onPostClick = { /* future: navigate to post detail */ },
                )
            }
            composable(Routes.NOTIFICATIONS) {
                NotificationsScreen()
            }
            composable(Routes.PROFILE) {
                ProfileScreen(onBack = { navController.popBackStack() })
            }
            composable(
                route = Routes.PROFILE_USER,
                arguments = listOf(navArgument("userId") { type = NavType.StringType }),
            ) {
                ProfileScreen(onBack = { navController.popBackStack() })
            }
        }
    }
}
