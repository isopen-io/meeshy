package me.meeshy.app.navigation

import android.content.Context
import android.content.ContextWrapper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import me.meeshy.ui.appearance.LocalPackShopOpener
import me.meeshy.ui.component.focal.LocalCallJournal
import me.meeshy.ui.appearance.PackShopOpener
import me.meeshy.ui.settings.LocalSettingsInviteOpener
import me.meeshy.ui.settings.SettingsInviteOpener
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModelStoreOwner
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.model.call.CallHeaderSnapshot
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import me.meeshy.app.calls.CallPillPresenter
import me.meeshy.app.calls.CallStatus
import me.meeshy.app.calls.CallViewModel
import me.meeshy.app.chat.ChatLocalCall
import me.meeshy.app.chat.ChatScreen
import me.meeshy.app.chat.ChatViewModel
import me.meeshy.app.chat.conversationcard.ProvideConversationLinkCards
import me.meeshy.app.navigation.CallRoute
import me.meeshy.app.navigation.ChatLockGate
import me.meeshy.app.navigation.ChatRouteArgs
import me.meeshy.app.navigation.ProvideConversationMoods
import me.meeshy.app.navigation.ReportsConversationViewing
import me.meeshy.app.navigation.Routes
import me.meeshy.app.navigation.graph.GameRoutes
import me.meeshy.app.settings.LocationSharingSettingsSheet

/**
 * Destination du fil de discussion `chat/{id}` (liens profonds, notifications, recherche, widget, liste) :
 * toutes passent par [ChatLockGate], qui demande le code d'une conversation verrouillee avant tout contenu.
 */
internal fun NavGraphBuilder.chatDestination(
    navController: NavHostController,
    callStatus: CallStatus,
) {
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
        ChatLockGate(conversationId = conversationId, onBack = { navController.popBackStack() }) {
            ReportsConversationViewing(conversationId)
            ProvideConversationMoods(navController, entry) {
                ProvideConversationLinkCards {
                    val localCall = rememberChatLocalCall(navController, callStatus)
                    val packShopOpener = remember(navController) {
                        PackShopOpener { domain -> navController.navigate(Routes.packShop(domain = domain.wire)) }
                    }
                    val settingsInviteOpener = remember(navController) {
                        SettingsInviteOpener { invite -> navController.navigate(Routes.settingsFocus(invite)) }
                    }
                    val callJournal = rememberCallJournalSlot(conversationId)
                    CompositionLocalProvider(
                        LocalCallJournal provides callJournal,
                        LocalPackShopOpener provides packShopOpener,
                        LocalSettingsInviteOpener provides settingsInviteOpener,
                    ) {
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
                        localCall = localCall,
                        locationSettingsSheet = { accent, onDismiss -> LocationSharingSettingsSheet(accent = accent, onDismiss = onDismiss) },
                        onOpenCitedPost = { postId -> navController.navigate(Routes.postDetail(postId)) },
                        onOpenConversation = { id -> navController.navigate(Routes.chat(id)) },
                        onOpenProgression = { navController.navigate(GameRoutes.PROGRESSION) { launchSingleTop = true } },
                    )
                    }
                }
            }
        }
    }
}

/**
 * L'appel de CET appareil vu de l'en-tête du fil : la phase et la conversation hôte (deux faits), la durée
 * vivante lue par la seule pastille, et le retour vers l'écran d'appel déjà ouvert (jamais un nouvel appel).
 * Le `CallViewModel` est celui de l'activité, comme à la racine ([MinimizedCallPill]).
 */
@Composable
private fun rememberChatLocalCall(navController: NavHostController, callStatus: CallStatus): ChatLocalCall {
    val owner = LocalContext.current.findViewModelOwner() ?: return ChatLocalCall.NONE
    val callViewModel: CallViewModel = hiltViewModel(viewModelStoreOwner = owner)
    val isActive = CallPillPresenter.isMinimizable(callStatus)
    val hostId = if (isActive) callViewModel.activeConfig.conversationId.takeIf { it.isNotBlank() } else null
    return remember(callViewModel, isActive, hostId) {
        ChatLocalCall(
            snapshot = CallHeaderSnapshot(isActive = isActive, conversationId = hostId),
            duration = callViewModel.state.map { it.durationLabel }.distinctUntilChanged(),
            onReturn = {
                navController.navigate(CallRoute.reopen(callViewModel.activeConfig)) { launchSingleTop = true }
            },
        )
    }
}

private tailrec fun Context.findViewModelOwner(): ViewModelStoreOwner? = when (this) {
    is ViewModelStoreOwner -> this
    is ContextWrapper -> baseContext.findViewModelOwner()
    else -> null
}
