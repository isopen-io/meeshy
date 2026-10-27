package me.meeshy.app.navigation.graph

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.hilt.navigation.compose.hiltViewModel
import me.meeshy.app.settings.LocationSharingSettingsSheet
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.calls.CallPillPresenter
import me.meeshy.app.calls.CallStatus
import me.meeshy.app.chat.ChatScreen
import me.meeshy.app.chat.ChatViewModel
import me.meeshy.app.chat.ConversationMembersPresenter
import me.meeshy.app.chat.StarredMessagesScreen
import me.meeshy.app.conversations.ConversationListScreen
import me.meeshy.app.conversations.ConversationRowNavigation
import me.meeshy.app.conversations.CreateShareLinkScreen
import me.meeshy.app.conversations.CreateShareLinkViewModel
import me.meeshy.app.conversations.DashboardScreen
import me.meeshy.app.conversations.GlobalSearchScreen
import me.meeshy.app.conversations.MyShareLinksScreen
import me.meeshy.app.conversations.NewConversationScreen
import me.meeshy.app.conversations.ShareLinkArrivalsScreen
import me.meeshy.app.conversations.ShareLinkDetailScreen
import me.meeshy.app.conversations.ShareLinkDetailViewModel
import me.meeshy.app.navigation.CallRoute
import me.meeshy.app.navigation.ChatRouteArgs
import me.meeshy.app.navigation.ReportsConversationViewing
import me.meeshy.app.navigation.Routes
import me.meeshy.app.navigation.navigateKeepingSheet
import me.meeshy.app.navigation.SheetStyle
import me.meeshy.app.navigation.rememberProfileOpenerOverSheet
import me.meeshy.app.navigation.sheetComposable
import me.meeshy.app.stories.StoriesViewModel
import me.meeshy.app.stories.StoryTray

/** Liste, recherche, tableau de bord, liens de partage, fil de discussion et messages favoris. */
internal fun NavGraphBuilder.conversationsNavGraph(
    navController: NavHostController,
    authViewModel: AuthViewModel,
    callStatus: CallStatus,
) {
    composable(
        route = Routes.CONVERSATIONS,
        deepLinks = listOf(
            navDeepLink { uriPattern = Routes.CONVERSATIONS_DEEP_LINK },
        ),
    ) {
        // Une seule instance pour la barre et le geste « tirer » : tirer la liste recharge
        // aussi les stories (iOS `ConversationListView` : pullToRefresh + loadStories).
        val storiesViewModel: StoriesViewModel = hiltViewModel()
        // « Gérer les membres » d'une rangée (#12865) : la fiche des membres s'ouvre sur la liste,
        // sans entrer dans la conversation, comme iOS.
        var membersTarget by remember { mutableStateOf<Pair<String, Color>?>(null) }
        membersTarget?.let { (conversationId, accent) ->
            ConversationMembersPresenter(
                conversationId = conversationId,
                accentColor = accent,
                onDismiss = { membersTarget = null },
            )
        }
        ConversationListScreen(
            onConversationClick = { conversationId ->
                navController.navigate(Routes.chat(conversationId))
            },
            onNewConversation = { navController.navigate(Routes.NEW_CONVERSATION) },
            onOpenShareLinkPicker = { navController.navigate(Routes.SHARE_LINK_PICKER) },
            onDashboard = { navController.navigate(Routes.DASHBOARD) },
            onGlobalSearch = { navController.navigate(Routes.GLOBAL_SEARCH) },
            onLogout = { authViewModel.logout() },
            header = {
                StoryTray(
                    onOpenStory = { userId -> navController.navigate(Routes.story(userId)) },
                    onAddStory = { navController.navigate(Routes.STORY_COMPOSER) },
                    onManageStories = { navController.navigate(Routes.MY_STORIES) },
                    onShowProfile = { userId -> navController.navigate(Routes.profile(userId)) },
                    viewModel = storiesViewModel,
                )
            },
            onRefresh = storiesViewModel::refresh,
            rowNavigation = ConversationRowNavigation(
                onManageMembers = { conversationId, accent -> membersTarget = conversationId to accent },
                onViewProfile = { userId -> navController.navigate(Routes.profile(userId)) },
                onCreateShareLink = { id -> navController.navigate(Routes.createShareLink(id)) },
            ),
            onOpenSettings = { navController.navigate(Routes.SETTINGS) },
        )
    }
    sheetComposable(Routes.SHARE_LINK_PICKER, navController) { _, dismiss ->
        CreateShareLinkScreen(
            onBack = dismiss,
            onCreated = dismiss,
            onNewConversation = { navController.navigate(Routes.NEW_CONVERSATION) },
        )
    }
    sheetComposable(Routes.GLOBAL_SEARCH, navController, style = SheetStyle.COVER) { _, dismiss ->
        GlobalSearchScreen(
            onBack = dismiss,
            onOpenConversation = { conversationId ->
                navController.navigate(Routes.chat(conversationId))
            },
            onOpenUser = rememberProfileOpenerOverSheet(navController),
        )
    }
    sheetComposable(Routes.DASHBOARD, navController) { _, dismiss ->
        DashboardScreen(
            onBack = dismiss,
            onOpenConversation = { conversationId ->
                navController.navigateKeepingSheet(Routes.chat(conversationId))
            },
            onNewConversation = { navController.navigate(Routes.NEW_CONVERSATION) },
            onGlobalSearch = { navController.navigate(Routes.GLOBAL_SEARCH) },
            onShareLinks = { navController.navigateKeepingSheet(Routes.MY_SHARE_LINKS) },
            onContacts = { navController.navigateKeepingSheet(Routes.CONTACTS) },
        )
    }
    sheetComposable(
        route = Routes.CREATE_SHARE_LINK,
        navController = navController,
        arguments = listOf(
            navArgument(CreateShareLinkViewModel.CONVERSATION_ID_ARG) { type = NavType.StringType },
        ),
    ) { _, dismiss ->
        CreateShareLinkScreen(
            onBack = dismiss,
            onCreated = dismiss,
        )
    }
    composable(Routes.MY_SHARE_LINKS) {
        MyShareLinksScreen(
            onBack = { navController.popBackStack() },
            onOpenLink = { link ->
                navController.navigate(Routes.shareLinkDetail(link.linkId))
            },
        )
    }
    composable(
        route = Routes.SHARE_LINK_DETAIL,
        arguments = listOf(
            navArgument(ShareLinkDetailViewModel.LINK_ID_ARG) { type = NavType.StringType },
        ),
    ) {
        ShareLinkDetailScreen(
            onBack = { navController.popBackStack() },
            onDeleted = { navController.popBackStack() },
            onSeeAllArrivals = { linkId -> navController.navigate(Routes.shareLinkArrivals(linkId)) },
        )
    }
    composable(
        route = Routes.SHARE_LINK_ARRIVALS,
        arguments = listOf(
            navArgument(ShareLinkDetailViewModel.LINK_ID_ARG) { type = NavType.StringType },
        ),
    ) {
        ShareLinkArrivalsScreen(onBack = { navController.popBackStack() })
    }
    sheetComposable(Routes.NEW_CONVERSATION, navController) { _, dismiss ->
        NewConversationScreen(
            onBack = dismiss,
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
            navArgument(ChatViewModel.DRAFT_ARG) { type = NavType.StringType; nullable = true; defaultValue = null },
            navArgument(ChatRouteArgs.HIGHLIGHT_MESSAGE_ID) { type = NavType.StringType; nullable = true; defaultValue = null },
        ),
        deepLinks = listOf(
            navDeepLink { uriPattern = Routes.CHAT_DEEP_LINK },
            navDeepLink { uriPattern = Routes.CONVERSATION_DEEP_LINK },
            navDeepLink { uriPattern = Routes.CONVERSATION_SINGULAR_DEEP_LINK },
            navDeepLink { uriPattern = Routes.CONVERSATION_SHORT_DEEP_LINK },
            navDeepLink { uriPattern = Routes.CONVERSATION_DRAFT_DEEP_LINK },
        ),
    ) { entry ->
        val conversationId = entry.arguments
            ?.getString(ChatViewModel.CONVERSATION_ID_ARG)
            .orEmpty()
        ReportsConversationViewing(conversationId)
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
            onCreateShareLink = {
                navController.navigate(Routes.createShareLink(conversationId))
            },
            // A live local call (minimised/floating) suppresses the rejoin
            // pill — don't offer to rejoin the call this device is in.
            hasLocalLiveCall = CallPillPresenter.isMinimizable(callStatus),
            locationSettingsSheet = { accent, onDismiss -> LocationSharingSettingsSheet(accent = accent, onDismiss = onDismiss) },
            onOpenCitedPost = { postId -> navController.navigate(Routes.postDetail(postId)) },
        )
    }
    composable(Routes.STARRED) {
        StarredMessagesScreen(
            onBack = { navController.popBackStack() },
            onOpenMessage = { conversationId, messageId ->
                navController.navigate(Routes.chat(conversationId, highlightMessageId = messageId))
            },
        )
    }
}
