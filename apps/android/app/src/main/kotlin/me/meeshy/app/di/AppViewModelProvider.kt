package me.meeshy.app.di

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import me.meeshy.app.MeeshyApplication
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.conversations.ConversationListViewModel

/** Factory wiring ViewModels to the [AppContainer]. */
object AppViewModelProvider {
    val Factory = viewModelFactory {
        initializer {
            AuthViewModel(meeshyApplication().container.authRepository)
        }
        initializer {
            ConversationListViewModel(meeshyApplication().container.conversationRepository)
        }
    }
}

private fun CreationExtras.meeshyApplication(): MeeshyApplication =
    this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as MeeshyApplication
