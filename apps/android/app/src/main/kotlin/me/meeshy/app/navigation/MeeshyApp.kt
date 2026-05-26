package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.auth.LoginScreen
import me.meeshy.app.chat.ChatScreen
import me.meeshy.app.chat.ChatViewModel
import me.meeshy.app.conversations.ConversationListScreen

object Routes {
    const val LOGIN = "login"
    const val CONVERSATIONS = "conversations"
    const val CHAT = "chat/{${ChatViewModel.CONVERSATION_ID_ARG}}"

    fun chat(conversationId: String): String = "chat/$conversationId"
}

@Composable
fun MeeshyApp() {
    val navController = rememberNavController()
    val authViewModel: AuthViewModel = hiltViewModel()
    val authState by authViewModel.state.collectAsStateWithLifecycle()

    val startDestination = if (authState.isAuthenticated) Routes.CONVERSATIONS else Routes.LOGIN

    NavHost(navController = navController, startDestination = startDestination) {
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
    }
}
