package me.meeshy.app.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.PeopleOutline
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import androidx.compose.ui.res.stringResource
import me.meeshy.app.R
import android.net.Uri
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.auth.LoginScreen
import me.meeshy.app.calls.CallHistoryScreen
import me.meeshy.app.calls.CallScreen
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.app.chat.ChatScreen
import me.meeshy.app.chat.ChatViewModel
import me.meeshy.app.contacts.ContactsScreen
import me.meeshy.app.conversations.ConversationListScreen
import me.meeshy.app.conversations.NewConversationScreen
import me.meeshy.app.feed.FeedScreen
import me.meeshy.app.notifications.NotificationsScreen
import me.meeshy.app.profile.ProfileScreen
import me.meeshy.app.settings.SettingsScreen
import me.meeshy.app.stories.StoryComposerScreen
import me.meeshy.app.stories.StoryTray
import me.meeshy.app.stories.StoryViewerScreen
import me.meeshy.app.stories.StoryViewerViewModel

object Routes {
    const val LOGIN = "login"
    const val CONVERSATIONS = "conversations"
    const val NEW_CONVERSATION = "conversations/new"
    const val CONVERSATIONS_DEEP_LINK = "meeshy://conversations"
    const val CHAT = "chat/{${ChatViewModel.CONVERSATION_ID_ARG}}"
    const val CHAT_DEEP_LINK = "meeshy://$CHAT"
    const val CONVERSATION_DEEP_LINK = "meeshy://conversations/{${ChatViewModel.CONVERSATION_ID_ARG}}"
    const val CONVERSATION_SINGULAR_DEEP_LINK = "meeshy://conversation/{${ChatViewModel.CONVERSATION_ID_ARG}}"
    const val CONVERSATION_SHORT_DEEP_LINK = "meeshy://c/{${ChatViewModel.CONVERSATION_ID_ARG}}"
    const val FEED = "feed"
    const val CALLS = "calls"
    const val CONTACTS = "contacts"
    const val NOTIFICATIONS = "notifications"
    const val SETTINGS = "settings"
    const val PROFILE_USER = "profile/{userId}"
    const val PROFILE_DEEP_LINK = "meeshy://$PROFILE_USER"
    const val STORY_VIEWER = "story/{${StoryViewerViewModel.USER_ID_ARG}}"
    const val STORY_DEEP_LINK = "meeshy://$STORY_VIEWER"
    const val STORY_COMPOSER = "story_composer"
    val CALL = CallRoute.PATTERN

    fun chat(conversationId: String): String = "chat/$conversationId"
    fun profile(userId: String): String = "profile/$userId"
    fun story(userId: String): String = "story/$userId"
    fun call(conversationId: String, peerName: String, isVideo: Boolean): String =
        CallRoute.path(conversationId, peerName, isVideo)
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
    val calls = stringResource(R.string.tab_calls)
    val activity = stringResource(R.string.tab_activity)
    val profile = stringResource(R.string.tab_profile)
    return remember(messages, feed, calls, activity, profile) {
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
                route = Routes.CALLS,
                label = calls,
                selectedIcon = { Icon(Icons.Filled.Call, contentDescription = calls) },
                unselectedIcon = { Icon(Icons.Outlined.Call, contentDescription = calls) },
            ),
            TabItem(
                route = Routes.NOTIFICATIONS,
                label = activity,
                selectedIcon = { Icon(Icons.Filled.Notifications, contentDescription = activity) },
                unselectedIcon = { Icon(Icons.Outlined.Notifications, contentDescription = activity) },
            ),
            TabItem(
                route = Routes.SETTINGS,
                label = profile,
                selectedIcon = { Icon(Icons.Filled.Settings, contentDescription = profile) },
                unselectedIcon = { Icon(Icons.Outlined.Settings, contentDescription = profile) },
            ),
        )
    }
}

private val tabRoutes = setOf(Routes.CONVERSATIONS, Routes.FEED, Routes.CALLS, Routes.NOTIFICATIONS, Routes.SETTINGS)

@Composable
fun MeeshyApp(
    launchRoute: String? = null,
    onLaunchRouteConsumed: () -> Unit = {},
) {
    val navController = rememberNavController()
    val authViewModel: AuthViewModel = hiltViewModel()
    val authState by authViewModel.state.collectAsStateWithLifecycle()

    val navBackStack by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStack?.destination?.route
    val showBottomBar = currentRoute in tabRoutes

    val startDestination = remember(authState.isAuthenticated) { if (authState.isAuthenticated) Routes.CONVERSATIONS else Routes.LOGIN }
    val tabs = rememberTabs()

    // Deep-link from a notification tap / full-screen call intent: navigate once
    // the graph is live and the user is authenticated, then mark it consumed so a
    // recomposition never re-navigates. An unauthenticated launch defers until
    // sign-in resolves (the route survives in Activity state across the login gate).
    LaunchedEffect(launchRoute, authState.isAuthenticated) {
        if (launchRoute != null && authState.isAuthenticated) {
            navController.navigate(launchRoute)
            onLaunchRouteConsumed()
        }
    }

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
            composable(
                route = Routes.CONVERSATIONS,
                deepLinks = listOf(
                    navDeepLink { uriPattern = Routes.CONVERSATIONS_DEEP_LINK },
                ),
            ) {
                ConversationListScreen(
                    onConversationClick = { conversationId ->
                        navController.navigate(Routes.chat(conversationId))
                    },
                    onNewConversation = { navController.navigate(Routes.NEW_CONVERSATION) },
                    onContacts = { navController.navigate(Routes.CONTACTS) },
                    onLogout = {
                        authViewModel.logout()
                        navController.navigate(Routes.LOGIN) {
                            popUpTo(Routes.CONVERSATIONS) { inclusive = true }
                        }
                    },
                    header = {
                        StoryTray(
                            onOpenStory = { userId -> navController.navigate(Routes.story(userId)) },
                            onAddStory = { navController.navigate(Routes.STORY_COMPOSER) },
                        )
                    },
                )
            }
            composable(Routes.NEW_CONVERSATION) {
                NewConversationScreen(
                    onBack = { navController.popBackStack() },
                    onConversationCreated = { conversationId ->
                        navController.navigate(Routes.chat(conversationId)) {
                            popUpTo(Routes.CONVERSATIONS)
                        }
                    },
                )
            }
            composable(
                route = Routes.CHAT,
                arguments = listOf(
                    navArgument(ChatViewModel.CONVERSATION_ID_ARG) { type = NavType.StringType },
                ),
                deepLinks = listOf(
                    navDeepLink { uriPattern = Routes.CHAT_DEEP_LINK },
                    navDeepLink { uriPattern = Routes.CONVERSATION_DEEP_LINK },
                    navDeepLink { uriPattern = Routes.CONVERSATION_SINGULAR_DEEP_LINK },
                    navDeepLink { uriPattern = Routes.CONVERSATION_SHORT_DEEP_LINK },
                ),
            ) { entry ->
                val conversationId = entry.arguments
                    ?.getString(ChatViewModel.CONVERSATION_ID_ARG)
                    .orEmpty()
                ChatScreen(
                    onBack = { navController.popBackStack() },
                    onStartCall = { peerName, isVideo ->
                        navController.navigate(Routes.call(conversationId, peerName, isVideo))
                    },
                )
            }
            composable(Routes.FEED) {
                FeedScreen(
                    onPostClick = { },
                )
            }
            composable(Routes.CALLS) {
                CallHistoryScreen(
                    onOpenCall = { record ->
                        navController.navigate(CallRoute.redial(record))
                    },
                )
            }
            composable(Routes.CONTACTS) {
                ContactsScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.NOTIFICATIONS) {
                NotificationsScreen()
            }
            composable(Routes.SETTINGS) {
                SettingsScreen(
                    onBack = { navController.popBackStack() },
                    onLogout = {
                        authViewModel.logout()
                        navController.navigate(Routes.LOGIN) {
                            popUpTo(Routes.CONVERSATIONS) { inclusive = true }
                        }
                    },
                    onOpenProfile = { userId -> navController.navigate(Routes.profile(userId)) },
                )
            }
            composable(
                route = Routes.PROFILE_USER,
                arguments = listOf(navArgument("userId") { type = NavType.StringType }),
                deepLinks = listOf(
                    navDeepLink { uriPattern = Routes.PROFILE_DEEP_LINK },
                ),
            ) {
                ProfileScreen(onBack = { navController.popBackStack() })
            }
            composable(
                route = Routes.STORY_VIEWER,
                arguments = listOf(navArgument(StoryViewerViewModel.USER_ID_ARG) { type = NavType.StringType }),
                deepLinks = listOf(
                    navDeepLink { uriPattern = Routes.STORY_DEEP_LINK },
                ),
            ) {
                StoryViewerScreen(onClose = { navController.popBackStack() })
            }
            composable(Routes.STORY_COMPOSER) {
                StoryComposerScreen(onClose = { navController.popBackStack() })
            }
            composable(
                route = Routes.CALL,
                arguments = listOf(
                    navArgument(CallRoute.CONVERSATION_ID_ARG) { type = NavType.StringType; nullable = true; defaultValue = null },
                    navArgument(CallRoute.PEER_NAME_ARG) { type = NavType.StringType; nullable = true; defaultValue = null },
                    navArgument(CallRoute.VIDEO_ARG) { type = NavType.BoolType; defaultValue = false },
                    navArgument(CallRoute.CALL_ID_ARG) { type = NavType.StringType; nullable = true; defaultValue = null },
                    navArgument(CallRoute.INCOMING_ARG) { type = NavType.BoolType; defaultValue = false },
                ),
            ) { entry ->
                val args = entry.arguments
                CallScreen(
                    config = CallRoute.config(
                        conversationId = args?.getString(CallRoute.CONVERSATION_ID_ARG)?.let(Uri::decode),
                        peerName = args?.getString(CallRoute.PEER_NAME_ARG)?.let(Uri::decode),
                        isVideo = args?.getBoolean(CallRoute.VIDEO_ARG),
                        callId = args?.getString(CallRoute.CALL_ID_ARG)?.let(Uri::decode),
                        incoming = args?.getBoolean(CallRoute.INCOMING_ARG) ?: false,
                    ),
                    onClose = { navController.popBackStack() },
                )
            }
        }
    }
}
