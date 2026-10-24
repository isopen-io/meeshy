package me.meeshy.app.navigation.graph

import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.contacts.ContactsScreen
import me.meeshy.app.contacts.ContactsTab
import me.meeshy.app.navigation.Routes

/**
 * L'onglet « Demandes » des contacts, ouvert directement (iOS `router.push(.peopleDiscovery(.requests))`) :
 * la ligne « Demandes d'amis » de MA page y mène.
 */
class FriendRequestsDestinations @Inject constructor() : NavGraphContributor {
    override fun contribute(builder: NavGraphBuilder, navController: NavHostController) {
        builder.composable(ROUTE) {
            ContactsScreen(
                onBack = { navController.popBackStack() },
                initialTab = ContactsTab.Requests,
                onOpenProfile = { userId -> if (userId.isNotBlank()) navController.navigate(Routes.profile(userId)) },
            )
        }
    }

    companion object {
        const val ROUTE = "contacts/requests"
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface FriendRequestsDestinationsModule {
    @Binds
    @IntoSet
    fun bind(contributor: FriendRequestsDestinations): NavGraphContributor
}
