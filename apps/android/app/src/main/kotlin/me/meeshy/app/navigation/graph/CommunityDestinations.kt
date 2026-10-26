package me.meeshy.app.navigation.graph

import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.community.CommunityDetailNavigation
import me.meeshy.app.community.CommunityDetailScreen
import me.meeshy.app.community.CommunityDetailViewModel
import me.meeshy.app.community.CommunityListScreen
import me.meeshy.app.navigation.Routes

/** Les routes de l'espace Communautés — une liste, un détail par identifiant, et leurs écrans fils. */
object CommunityRoutes {
    const val LIST = "communities"
    const val DETAIL = "community/{${CommunityDetailViewModel.COMMUNITY_ID_ARG}}"

    fun detail(communityId: String): String = "community/$communityId"
}

/**
 * Les destinations Communautés (iOS `CommunityListView` / `CommunityDetailView`), contribuées au
 * `NavHost` racine sans éditer `MeeshyApp` : le barreau « Communautés » du menu flottant ouvre la liste.
 */
class CommunityDestinations @Inject constructor() : NavGraphContributor {
    override fun contribute(builder: NavGraphBuilder, navController: NavHostController) {
        builder.composable(CommunityRoutes.LIST) {
            CommunityListScreen(
                onBack = { navController.popBackStack() },
                onOpenCommunity = { navController.navigate(CommunityRoutes.detail(it)) },
                onCreateCommunity = { },
            )
        }
        builder.composable(
            route = CommunityRoutes.DETAIL,
            arguments = listOf(navArgument(CommunityDetailViewModel.COMMUNITY_ID_ARG) { type = NavType.StringType }),
        ) {
            CommunityDetailScreen(
                navigation = CommunityDetailNavigation(
                    onBack = { navController.popBackStack() },
                    onOpenChannel = { navController.navigate(Routes.chat(it)) },
                ),
            )
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface CommunityDestinationsModule {
    @Binds
    @IntoSet
    fun bind(contributor: CommunityDestinations): NavGraphContributor
}
