package me.meeshy.app.navigation.graph

import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.calls.CallPillPresenter
import me.meeshy.app.calls.CallUiState
import me.meeshy.app.chat.ChatScreen
import me.meeshy.app.chat.ChatViewModel
import me.meeshy.app.chat.StarredMessagesScreen
import me.meeshy.app.conversations.ConversationListScreen
import me.meeshy.app.conversations.ConversationRowNavigation
import me.meeshy.app.conversations.CreateShareLinkScreen
import me.meeshy.app.conversations.CreateShareLinkViewModel
import me.meeshy.app.conversations.DashboardScreen
import me.meeshy.app.conversations.GlobalSearchScreen
import me.meeshy.app.conversations.MyShareLinksScreen
import me.meeshy.app.conversations.NewConversationScreen
import me.meeshy.app.conversations.ShareLinkDetailScreen
import me.meeshy.app.conversations.ShareLinkDetailViewModel
import me.meeshy.app.navigation.CallRoute
import me.meeshy.app.navigation.ChatRouteArgs
import me.meeshy.app.navigation.ReportsConversationViewing
import me.meeshy.app.navigation.Routes
import me.meeshy.app.stories.StoriesViewModel
import me.meeshy.app.stories.StoryTray

/** Liste, recherche, tableau de bord, liens de partage, fil de discussion et messages favoris. */
internal fun NavGraphBuilder.conversationsNavGraph(
    navController: NavHostController,
    authViewModel: AuthViewModel,
    callState: CallUiState,
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
                    onShowProfile = { userId -> navController.navigate(Routes.profile(userId)) },
                    viewModel = storiesViewModel,
                )
            },
            onRefresh = storiesViewModel::refresh,
            rowNavigation = ConversationRowNavigation(
                onViewProfile = { userId -> navController.navigate(Routes.profile(userId)) },
                onCreateShareLink = { id -> navController.navigate(Routes.createShareLink(id)) },
            ),
        )
    }
    composable(Routes.SHARE_LINK_PICKER) {
        CreateShareLinkScreen(
            onBack = { navController.popBackStack() },
            onCreated = { navController.popBackStack() },
            onNewConversation = { navController.navigate(Routes.NEW_CONVERSATION) },
        )
    }
    composable(Routes.GLOBAL_SEARCH) {
        GlobalSearchScreen(
            onBack = { navController.popBackStack() },
            onOpenConversation = { conversationId ->
                navController.navigate(Routes.chat(conversationId))
            },
            onOpenUser = { userId ->
                navController.navigate(Routes.profile(userId))
            },
        )
    }
    composable(Routes.DASHBOARD) {
        DashboardScreen(
            onBack = { navController.popBackStack() },
            onOpenConversation = { conversationId ->
                navController.navigate(Routes.chat(conversationId))
            },
            onNewConversation = { navController.navigate(Routes.NEW_CONVERSATION) },
            onGlobalSearch = { navController.navigate(Routes.GLOBAL_SEARCH) },
            onShareLinks = { navController.navigate(Routes.MY_SHARE_LINKS) },
            onContacts = { navController.navigate(Routes.CONTACTS) },
        )
    }
    composable(
        route = Routes.CREATE_SHARE_LINK,
        arguments = listOf(
            navArgument(CreateShareLinkViewModel.CONVERSATION_ID_ARG) { type = NavType.StringType },
        ),
    ) {
        CreateShareLinkScreen(
            onBack = { navController.popBackStack() },
            onCreated = { navController.popBackStack() },
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
            hasLocalLiveCall = CallPillPresenter.isMinimizable(callState.status),
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
