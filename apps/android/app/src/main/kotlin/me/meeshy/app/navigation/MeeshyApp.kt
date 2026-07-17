package me.meeshy.app.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
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
import kotlinx.coroutines.delay
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.auth.LoginScreen
import me.meeshy.app.calls.CallHistoryScreen
import me.meeshy.app.calls.CallPill
import me.meeshy.app.calls.CallPillPresenter
import me.meeshy.app.calls.CallScreen
import me.meeshy.app.calls.CallStatus
import me.meeshy.app.calls.CallViewModel
import me.meeshy.app.calls.IncomingCallViewModel
import me.meeshy.ui.component.chrome.MeeshyMenuFab
import me.meeshy.ui.component.chrome.RadialMenuItem
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.app.chat.ChatScreen
import me.meeshy.app.chat.ChatViewModel
import me.meeshy.app.chat.StarredMessagesScreen
import me.meeshy.app.contacts.ContactsScreen
import me.meeshy.app.conversations.ConversationListScreen
import me.meeshy.app.conversations.NewConversationScreen
import me.meeshy.app.feed.BookmarksScreen
import me.meeshy.app.feed.UserPostsScreen
import me.meeshy.app.feed.FeedScreen
import me.meeshy.app.notifications.NotificationsScreen
import me.meeshy.app.reels.ReelsScreen
import me.meeshy.app.profile.ProfileScreen
import me.meeshy.app.profile.ReportUserScreen
import me.meeshy.app.profile.ReportUserViewModel
import me.meeshy.app.settings.AboutScreen
import me.meeshy.app.settings.AccountDeletionScreen
import me.meeshy.app.settings.ChangePasswordScreen
import me.meeshy.app.settings.CrashReportScreen
import me.meeshy.app.settings.DataExportScreen
import me.meeshy.app.settings.LegalDocumentScreen
import me.meeshy.app.settings.LicensesScreen
import me.meeshy.app.settings.MediaCacheScreen
import me.meeshy.sdk.model.legal.LegalDocumentKind
import me.meeshy.app.settings.MediaDownloadScreen
import me.meeshy.app.settings.PrivacySettingsScreen
import me.meeshy.app.settings.SettingsScreen
import me.meeshy.app.settings.SupportScreen
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
    const val SAVED_POSTS = "feed/saved"
    const val CALLS = "calls"
    const val CONTACTS = "contacts"
    const val NOTIFICATIONS = "notifications"
    const val SETTINGS = "settings"
    const val CHANGE_PASSWORD = "settings/change-password"
    const val MEDIA_DOWNLOAD = "settings/media-download"
    const val MEDIA_CACHE = "settings/media-cache"
    const val PRIVACY = "settings/privacy"
    const val DATA_EXPORT = "settings/data-export"
    const val DIAGNOSTICS = "settings/diagnostics"
    const val ABOUT = "settings/about"
    const val SUPPORT = "settings/support"
    const val LICENSES = "settings/licenses"
    const val LEGAL_DOC_ARG = "doc"
    const val LEGAL = "settings/legal/{$LEGAL_DOC_ARG}"
    const val DELETE_ACCOUNT = "settings/delete-account"
    const val STARRED = "starred"
    const val PROFILE_USER = "profile/{userId}"
    const val PROFILE_DEEP_LINK = "meeshy://$PROFILE_USER"
    const val USER_POSTS = "profile/{userId}/posts"
    const val REPORT_USER = "report/{${ReportUserViewModel.USER_ID_ARG}}?${ReportUserViewModel.USERNAME_ARG}={${ReportUserViewModel.USERNAME_ARG}}"
    const val STORY_VIEWER = "story/{${StoryViewerViewModel.USER_ID_ARG}}"
    const val STORY_DEEP_LINK = "meeshy://$STORY_VIEWER"
    const val STORY_COMPOSER = "story_composer"
    const val REELS = "reels?seed={seed}"
    val CALL = CallRoute.PATTERN

    fun reels(seed: String? = null): String = if (seed == null) "reels" else "reels?seed=$seed"
    fun chat(conversationId: String): String = "chat/$conversationId"
    fun profile(userId: String): String = "profile/$userId"
    fun userPosts(userId: String): String = "profile/$userId/posts"
    fun reportUser(userId: String, username: String): String =
        "report/$userId?${ReportUserViewModel.USERNAME_ARG}=${Uri.encode(username)}"
    fun story(userId: String): String = "story/$userId"
    fun legal(kind: LegalDocumentKind): String = "settings/legal/${kind.arg}"
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
    val contacts = stringResource(R.string.menu_contacts)
    return remember(messages, feed, calls, activity, profile, newConversation, reels, contacts) {
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
            RadialMenuItem(Icons.Filled.People, contacts, MeeshyPalette.PinnedBlue) {
                navController.navigate(Routes.CONTACTS)
            },
            RadialMenuItem(Icons.Filled.Settings, profile, MeeshyPalette.Purple500, onSelect = tab(Routes.SETTINGS)),
        )
    }
}

private val tabRoutes = setOf(Routes.CONVERSATIONS, Routes.FEED, Routes.CALLS, Routes.NOTIFICATIONS, Routes.SETTINGS)

/**
 * A call that ends while minimised leaves the full-screen [CallScreen] un-composed,
 * so its own auto-dismiss never fires. This app-level settle window brings the
 * Activity-scoped [CallViewModel] back to idle after the ended beat, so the next
 * call can start (parity with [CallScreen]'s CALL_ENDED_AUTO_DISMISS_MS).
 */
private const val CALL_ENDED_MINIMISED_SETTLE_MS = 1500L

@Composable
fun MeeshyApp(
    launchRoute: String? = null,
    onLaunchRouteConsumed: () -> Unit = {},
) {
    val navController = rememberNavController()
    val authViewModel: AuthViewModel = hiltViewModel()
    val incomingCallViewModel: IncomingCallViewModel = hiltViewModel()
    // Hoisted to the MeeshyApp root → resolved against the Activity's ViewModelStore
    // (like [authViewModel] above), NOT the CALL destination's back-stack entry. This
    // is what lets the call survive minimisation: leaving the CALL screen clears only
    // that entry's store, never this Activity-scoped instance, so the WebRTC session
    // and every collector in [CallViewModel] stay alive while the conversation shows.
    val callViewModel: CallViewModel = hiltViewModel()
    val authState by authViewModel.state.collectAsStateWithLifecycle()
    val callState by callViewModel.state.collectAsStateWithLifecycle()

    val navBackStack by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStack?.destination?.route
    val showMenuFab = currentRoute in tabRoutes
    val onCallScreen = currentRoute == CallRoute.PATTERN

    // Settle a call that ended while minimised: [CallScreen]'s own auto-dismiss only
    // runs while it is composed, so an ended call left in the pill would strand the
    // Activity-scoped FSM in ENDED and block the next call. The pill has already
    // vanished (ENDED is not a pill status); this only resets the state machine.
    LaunchedEffect(callState.status, onCallScreen) {
        if (callState.status == CallStatus.ENDED && !onCallScreen) {
            delay(CALL_ENDED_MINIMISED_SETTLE_MS)
            callViewModel.dismiss()
        }
    }

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

    // App-level ring: a foreground `call:initiated` socket offer navigates into the
    // incoming-call screen (the Android analogue of iOS CallManager.shared observed
    // at RootView). Reads the live destination per offer so a second offer mid-call
    // yields no route (call-waiting stays with CallViewModel's banner).
    LaunchedEffect(Unit) {
        incomingCallViewModel.incomingOffers.collect { offer ->
            LaunchRouter.routeIncomingSocketOffer(offer, navController.currentDestination?.route)
                ?.let(navController::navigate)
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
      Box(modifier = Modifier.fillMaxSize()) {
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
                    onRejoinCall = { call, peerName ->
                        // Rejoin an existing, still-live call: reuse the incoming
                        // deep-link with autoAnswer so the shared join path adopts
                        // the server callId and connects straight away — never a
                        // new outgoing call.
                        navController.navigate(
                            CallRoute.incoming(
                                callId = call.id,
                                conversationId = conversationId,
                                callerName = peerName,
                                isVideo = call.isVideo,
                                autoAnswer = true,
                            ),
                        )
                    },
                    // A live local call (minimised/floating) suppresses the rejoin
                    // pill — don't offer to rejoin the call this device is in.
                    hasLocalLiveCall = CallPillPresenter.isMinimizable(callState.status),
                )
            }
            composable(Routes.FEED) {
                FeedScreen(
                    onPostClick = { postId -> navController.navigate(Routes.reels(seed = postId)) },
                    onOpenSaved = { navController.navigate(Routes.SAVED_POSTS) },
                )
            }
            composable(Routes.SAVED_POSTS) {
                BookmarksScreen(
                    onBack = { navController.popBackStack() },
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
                    onOpenStarred = { navController.navigate(Routes.STARRED) },
                    onOpenChangePassword = { navController.navigate(Routes.CHANGE_PASSWORD) },
                    onOpenAutoDownload = { navController.navigate(Routes.MEDIA_DOWNLOAD) },
                    onOpenMediaCache = { navController.navigate(Routes.MEDIA_CACHE) },
                    onOpenPrivacy = { navController.navigate(Routes.PRIVACY) },
                    onOpenDataExport = { navController.navigate(Routes.DATA_EXPORT) },
                    onOpenDiagnostics = { navController.navigate(Routes.DIAGNOSTICS) },
                    onOpenAbout = { navController.navigate(Routes.ABOUT) },
                    onOpenSupport = { navController.navigate(Routes.SUPPORT) },
                    onOpenLicenses = { navController.navigate(Routes.LICENSES) },
                    onOpenTerms = {
                        navController.navigate(Routes.legal(LegalDocumentKind.TERMS_OF_SERVICE))
                    },
                    onOpenPrivacyPolicy = {
                        navController.navigate(Routes.legal(LegalDocumentKind.PRIVACY_POLICY))
                    },
                    onOpenDeleteAccount = { navController.navigate(Routes.DELETE_ACCOUNT) },
                )
            }
            composable(Routes.CHANGE_PASSWORD) {
                ChangePasswordScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.DELETE_ACCOUNT) {
                AccountDeletionScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.MEDIA_DOWNLOAD) {
                MediaDownloadScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.MEDIA_CACHE) {
                MediaCacheScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.DATA_EXPORT) {
                DataExportScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.DIAGNOSTICS) {
                CrashReportScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.ABOUT) {
                AboutScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.SUPPORT) {
                SupportScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.LICENSES) {
                LicensesScreen(onBack = { navController.popBackStack() })
            }
            composable(
                route = Routes.LEGAL,
                arguments = listOf(navArgument(Routes.LEGAL_DOC_ARG) { type = NavType.StringType }),
            ) { backStackEntry ->
                val kind = LegalDocumentKind.fromArg(
                    backStackEntry.arguments?.getString(Routes.LEGAL_DOC_ARG),
                ) ?: LegalDocumentKind.TERMS_OF_SERVICE
                LegalDocumentScreen(kind = kind, onBack = { navController.popBackStack() })
            }
            composable(Routes.PRIVACY) {
                PrivacySettingsScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.STARRED) {
                StarredMessagesScreen(
                    onBack = { navController.popBackStack() },
                    onOpenConversation = { conversationId ->
                        navController.navigate(Routes.chat(conversationId))
                    },
                )
            }
            composable(
                route = Routes.PROFILE_USER,
                arguments = listOf(navArgument("userId") { type = NavType.StringType }),
                deepLinks = listOf(
                    navDeepLink { uriPattern = Routes.PROFILE_DEEP_LINK },
                ),
            ) {
                ProfileScreen(
                    onBack = { navController.popBackStack() },
                    onReport = { userId, username ->
                        navController.navigate(Routes.reportUser(userId, username))
                    },
                    onViewPosts = { userId -> navController.navigate(Routes.userPosts(userId)) },
                )
            }
            composable(
                route = Routes.USER_POSTS,
                arguments = listOf(navArgument("userId") { type = NavType.StringType }),
            ) {
                UserPostsScreen(
                    onBack = { navController.popBackStack() },
                    onPostClick = { postId -> navController.navigate(Routes.reels(seed = postId)) },
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
                    navArgument(CallRoute.ANSWER_ARG) { type = NavType.BoolType; defaultValue = false },
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
                    autoAnswer = args?.getBoolean(CallRoute.ANSWER_ARG) ?: false,
                    // Activity-scoped instance (see the hoist above) → the CALL
                    // destination re-attaches to the live call instead of spinning
                    // up a nav-scoped one that would die on the next pop.
                    viewModel = callViewModel,
                    // Minimise → open the DM with the call still running. popUpTo the
                    // CALL entry (inclusive) so the back stack never accumulates stale
                    // call screens that a Back press could re-enter (and re-initiate).
                    onMinimize = {
                        navController.navigate(Routes.chat(callViewModel.activeConfig.conversationId)) {
                            popUpTo(CallRoute.PATTERN) { inclusive = true }
                            launchSingleTop = true
                        }
                    },
                    onClose = { navController.popBackStack() },
                )
            }
        }

        // Minimised-call pill: a full-width banner pinned under the status bar,
        // shown only for a live, non-incoming call while off the CALL screen. A tap
        // rebuilds the CALL route from the live config and re-opens the full screen;
        // the Activity-scoped [callViewModel] is reused, so `start()` is inert.
        if (CallPillPresenter.shouldShow(callState.status, onCallScreen)) {
            CallPill(
                state = callState,
                onClick = {
                    navController.navigate(CallRoute.reopen(callViewModel.activeConfig)) {
                        launchSingleTop = true
                    }
                },
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(padding)
                    .padding(top = MeeshySpacing.sm),
            )
        }
      }
    }
}
