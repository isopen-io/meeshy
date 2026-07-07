package me.meeshy.app.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
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
import me.meeshy.ui.component.chrome.MeeshyMenuFab
import me.meeshy.ui.component.chrome.RadialMenuItem
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.app.chat.ChatScreen
import me.meeshy.app.chat.ChatViewModel
import me.meeshy.app.contacts.ContactsScreen
import me.meeshy.app.conversations.ConversationListScreen
import me.meeshy.app.conversations.NewConversationScreen
import me.meeshy.app.feed.FeedScreen
import me.meeshy.app.notifications.NotificationsScreen
import me.meeshy.app.reels.ReelsScreen
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
    const val REELS = "reels?seed={seed}"
    val CALL = CallRoute.PATTERN

    fun reels(seed: String? = null): String = if (seed == null) "reels" else "reels?seed=$seed"
    fun chat(conversationId: String): String = "chat/$conversationId"
    fun profile(userId: String): String = "profile/$userId"
    fun story(userId: String): String = "story/$userId"
    fun call(conversationId: String, peerName: String, isVideo: Boolean): String =
        CallRoute.path(conversationId, peerName, isVideo)
}

/**
 * iOS parity (Option A): the bottom tab bar is replaced by the radial [MeeshyMenuFab].
 * Each item navigates to a top-level destination with the same save/restore-state
 * semantics the tab bar used, plus a "new conversation" shortcut.
 */
@Composable
private fun rememberRadialMenuItems(navController: NavController): List<RadialMenuItem> {
    val messages = stringResource(R.string.tab_messages)
    val feed = stringResource(R.string.tab_feed)
    val calls = stringResource(R.string.tab_calls)
    val activity = stringResource(R.string.tab_activity)
    val profile = stringResource(R.string.tab_profile)
    val newConversation = stringResource(R.string.menu_new_conversation)
    val reels = stringResource(R.string.menu_reels)
    return remember(messages, feed, calls, activity, profile, newConversation, reels) {
        fun tab(route: String): () -> Unit = {
            navController.navigate(route) {
                popUpTo(navController.graph.startDestinationId) { saveState = true }
                launchSingleTop = true
                restoreState = true
            }
        }
        listOf(
            RadialMenuItem(Icons.AutoMirrored.Filled.Chat, newConversation, MeeshyPalette.Indigo500) {
                navController.navigate(Routes.NEW_CONVERSATION)
            },
            RadialMenuItem(Icons.Filled.ChatBubble, messages, MeeshyPalette.Indigo500, onSelect = tab(Routes.CONVERSATIONS)),
            RadialMenuItem(Icons.Filled.Home, feed, MeeshyPalette.Success, onSelect = tab(Routes.FEED)),
            RadialMenuItem(Icons.Filled.PlayCircle, reels, MeeshyPalette.Error) {
                navController.navigate(Routes.reels())
            },
            RadialMenuItem(Icons.Filled.Call, calls, MeeshyPalette.Info, onSelect = tab(Routes.CALLS)),
            RadialMenuItem(Icons.Filled.Notifications, activity, MeeshyPalette.Warning, onSelect = tab(Routes.NOTIFICATIONS)),
            RadialMenuItem(Icons.Filled.Settings, profile, MeeshyPalette.Purple500, onSelect = tab(Routes.SETTINGS)),
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
    val showMenuFab = currentRoute in tabRoutes

    val startDestination = remember(authState.isAuthenticated) { if (authState.isAuthenticated) Routes.CONVERSATIONS else Routes.LOGIN }
    val radialItems = rememberRadialMenuItems(navController)

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
        floatingActionButton = {
            if (showMenuFab) {
                MeeshyMenuFab(items = radialItems)
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
                    onPostClick = { postId -> navController.navigate(Routes.reels(seed = postId)) },
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
                route = Routes.REELS,
                arguments = listOf(
                    navArgument("seed") { type = NavType.StringType; nullable = true; defaultValue = null },
                ),
            ) { entry ->
                ReelsScreen(
                    seed = entry.arguments?.getString("seed"),
                    onClose = { navController.popBackStack() },
                )
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
