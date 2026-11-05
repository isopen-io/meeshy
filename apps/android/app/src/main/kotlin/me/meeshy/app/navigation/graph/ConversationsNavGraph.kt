package me.meeshy.app.navigation.graph

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.calls.CallStatus
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
import me.meeshy.app.navigation.MeeshyPinnedStoryBand
import me.meeshy.app.navigation.MeeshyStoryRail
import me.meeshy.app.navigation.chatDestination
import me.meeshy.app.navigation.Routes
import me.meeshy.app.navigation.navigateClosingSheet
import me.meeshy.app.navigation.navigateKeepingSheet
import me.meeshy.app.navigation.SheetStyle
import me.meeshy.app.navigation.rememberProfileOpenerOverSheet
import me.meeshy.app.navigation.sheetComposable
import me.meeshy.app.feed.MoodLookup
import me.meeshy.app.feed.StatusesViewModel
import me.meeshy.app.navigation.rememberStatusBubbleController
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.search.PostSearchDestination
import me.meeshy.app.stories.StoriesViewModel

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
        // Le rail lit les humeurs de ce même ViewModel ; tirer la liste les recharge avec les stories (iOS `ConversationListView`).
        val statusesViewModel: StatusesViewModel = hiltViewModel()
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
        // Le toucher de l'avatar d'une ligne (#15989) : la fiche Conversation s'ouvre sur la liste, hors du fil.
        var infoTarget by remember { mutableStateOf<Pair<ApiConversation, String?>?>(null) }
        infoTarget?.let { (conversation, readerId) ->
            ConversationInfoFromList(conversation, readerId, navController) { infoTarget = null }
        }
        // La bulle d'humeur du badge d'avatar : les humeurs se lisent au toucher (`state.value`), jamais ici,
        // pour qu'une humeur qui change ne recompose pas les lignes ; la bulle se dessine à la racine.
        val moodBubble = rememberStatusBubbleController()
        val moodsNow = { MoodLookup.from(statusesViewModel.state.value) }
        val openProfile = rememberProfileOpenerOverSheet(navController)
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
                MeeshyStoryRail(navController = navController, storiesViewModel = storiesViewModel, statusesViewModel = statusesViewModel)
            },
            pinnedBand = { reveal -> MeeshyPinnedStoryBand(navController, storiesViewModel, reveal, statusesViewModel = statusesViewModel) },
            onRefresh = {
                storiesViewModel.refresh()
                statusesViewModel.refresh()
            },
            rowNavigation = ConversationRowNavigation(
                onManageMembers = { conversationId, accent -> membersTarget = conversationId to accent },
                onViewProfile = openProfile,
                onCreateShareLink = { id -> navController.navigate(Routes.createShareLink(id)) },
                // #14897 : « Détails » ouvre la conversation (sa feuille d'infos est à un geste de l'en-tête) ;
                // « Appeler » compose l'appel audio du pair sans passer par le chat.
                onViewInfo = { id -> navController.navigate(Routes.chat(id)) },
                onCall = { id, peerName -> navController.navigate(Routes.call(id, peerName, false)) },
                onViewConversationInfo = { conversation, readerId -> infoTarget = conversation to readerId },
                onViewStory = { userId -> navController.navigate(Routes.story(userId)) },
                onMoodBadgeTap = { userId ->
                    moodsNow().entryOf(userId)?.let(moodBubble::show)
                },
                onMoodShown = { userId -> moodsNow().statusIdOf(userId)?.let(statusesViewModel::trackAvatarImpression) },
            ),
            onOpenSettings = { navController.navigate(Routes.SETTINGS) },
            onOpenMessage = { conversationId, messageId ->
                navController.navigate(Routes.chat(conversationId, highlightMessageId = messageId))
            },
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
        // #14671 — un post, un réel ou une story ouverts depuis les résultats y reviennent (même requête, même
        // onglet) ; une conversation ouverte ferme la recherche, comme iOS.
        GlobalSearchScreen(
            onBack = dismiss,
            onOpenConversation = { conversationId ->
                navController.navigateClosingSheet(Routes.chat(conversationId))
            },
            onOpenMessage = { conversationId, messageId ->
                navController.navigateClosingSheet(Routes.chat(conversationId, highlightMessageId = messageId))
            },
            onOpenPost = { destination ->
                navController.navigateKeepingSheet(
                    when (destination) {
                        is PostSearchDestination.Post -> Routes.postDetail(destination.postId)
                        is PostSearchDestination.Reel -> Routes.reels(seed = destination.postId)
                        is PostSearchDestination.Story -> Routes.story(destination.authorId, destination.storyId)
                    },
                )
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
            createOnOpen = true,
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
    chatDestination(navController, callStatus)
    composable(Routes.STARRED) {
        StarredMessagesScreen(
            onBack = { navController.popBackStack() },
            onOpenMessage = { conversationId, messageId ->
                navController.navigate(Routes.chat(conversationId, highlightMessageId = messageId))
            },
        )
    }
}
