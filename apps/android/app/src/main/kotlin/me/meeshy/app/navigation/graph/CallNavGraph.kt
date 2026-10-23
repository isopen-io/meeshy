package me.meeshy.app.navigation.graph

import android.net.Uri
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import me.meeshy.app.calls.CallHistoryScreen
import me.meeshy.app.calls.CallScreen
import me.meeshy.app.calls.CallViewModel
import me.meeshy.app.navigation.CallRoute
import me.meeshy.app.navigation.Routes

/** Historique des appels et ecran d'appel plein ecran. */
internal fun NavGraphBuilder.callNavGraph(
    navController: NavHostController,
    callViewModel: CallViewModel,
) {
    composable(Routes.CALLS) {
        CallHistoryScreen(
            onOpenCall = { record ->
                navController.navigate(CallRoute.redial(record))
            },
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
                navController.navigate(CallRoute.minimize(callViewModel.activeConfig.conversationId)) {
                    popUpTo(CallRoute.PATTERN) { inclusive = true }
                    launchSingleTop = true
                }
            },
            onClose = { navController.popBackStack() },
        )
    }
}
