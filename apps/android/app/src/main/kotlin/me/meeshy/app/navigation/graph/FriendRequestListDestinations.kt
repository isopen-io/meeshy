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
import me.meeshy.app.contacts.FriendRequestListScreen
import me.meeshy.app.navigation.rememberProfileOpenerOverSheet

/** L'écran autonome « Demandes d'amis » (iso `FriendRequestListView`), route `friends/requests`. */
class FriendRequestListDestinations @Inject constructor() : NavGraphContributor {
    override fun contribute(builder: NavGraphBuilder, navController: NavHostController) {
        builder.composable(ROUTE) {
            FriendRequestListScreen(
                onBack = { navController.popBackStack() },
                onOpenProfile = rememberProfileOpenerOverSheet(navController),
            )
        }
    }

    companion object {
        const val ROUTE = "friends/requests"
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface FriendRequestListDestinationsModule {
    @Binds
    @IntoSet
    fun bind(contributor: FriendRequestListDestinations): NavGraphContributor
}
