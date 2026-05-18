package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.auth.LoginScreen
import me.meeshy.app.conversations.ConversationListScreen

object Routes {
    const val LOGIN = "login"
    const val CONVERSATIONS = "conversations"
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
                onLogout = {
                    authViewModel.logout()
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(Routes.CONVERSATIONS) { inclusive = true }
                    }
                },
            )
        }
    }
}
