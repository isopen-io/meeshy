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
import me.meeshy.app.community.CommunityAddChannelSheet
import me.meeshy.app.community.CommunityCreateScreen
import me.meeshy.app.community.CommunityDetailNavigation
import me.meeshy.app.community.CommunityDetailScreen
import me.meeshy.app.community.CommunityDetailViewModel
import me.meeshy.app.community.CommunityInviteScreen
import me.meeshy.app.community.CommunityListScreen
import me.meeshy.app.community.CommunityMembersScreen
import me.meeshy.app.community.CommunitySettingsScreen
import me.meeshy.app.navigation.Routes

/** Les routes de l'espace Communautés — une liste, un détail par identifiant, et leurs écrans fils. */
object CommunityRoutes {
    const val LIST = "communities"
    const val CREATE = "communities/new"
    const val DETAIL = "community/{${CommunityDetailViewModel.COMMUNITY_ID_ARG}}"
    const val MEMBERS = "community/{${CommunityDetailViewModel.COMMUNITY_ID_ARG}}/members"
    const val INVITE = "community/{${CommunityDetailViewModel.COMMUNITY_ID_ARG}}/invite"
    const val SETTINGS = "community/{${CommunityDetailViewModel.COMMUNITY_ID_ARG}}/settings"

    fun detail(communityId: String): String = "community/$communityId"

    fun members(communityId: String): String = "community/$communityId/members"

    fun invite(communityId: String): String = "community/$communityId/invite"

    fun settings(communityId: String): String = "community/$communityId/settings"
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
                onCreateCommunity = { navController.navigate(CommunityRoutes.CREATE) },
            )
        }
        builder.composable(CommunityRoutes.CREATE) {
            CommunityCreateScreen(
                onBack = { navController.popBackStack() },
                onCreated = { id ->
                    navController.navigate(CommunityRoutes.detail(id)) { popUpTo(CommunityRoutes.CREATE) { inclusive = true } }
                },
            )
        }
        builder.composable(
            route = CommunityRoutes.SETTINGS,
            arguments = listOf(navArgument(CommunityDetailViewModel.COMMUNITY_ID_ARG) { type = NavType.StringType }),
        ) {
            CommunitySettingsScreen(
                onCancel = { navController.popBackStack() },
                onSaved = { navController.popBackStack() },
                onDeleted = { navController.popBackStack(CommunityRoutes.LIST, inclusive = false) },
            )
        }
        builder.composable(
            route = CommunityRoutes.MEMBERS,
            arguments = listOf(navArgument(CommunityDetailViewModel.COMMUNITY_ID_ARG) { type = NavType.StringType }),
        ) { entry ->
            val id = entry.arguments?.getString(CommunityDetailViewModel.COMMUNITY_ID_ARG).orEmpty()
            CommunityMembersScreen(
                onBack = { navController.popBackStack() },
                onInvite = { navController.navigate(CommunityRoutes.invite(id)) },
            )
        }
        builder.composable(
            route = CommunityRoutes.INVITE,
            arguments = listOf(navArgument(CommunityDetailViewModel.COMMUNITY_ID_ARG) { type = NavType.StringType }),
        ) {
            CommunityInviteScreen(onDone = { navController.popBackStack() })
        }
        builder.composable(
            route = CommunityRoutes.DETAIL,
            arguments = listOf(navArgument(CommunityDetailViewModel.COMMUNITY_ID_ARG) { type = NavType.StringType }),
        ) {
            CommunityDetailScreen(
                navigation = CommunityDetailNavigation(
                    onBack = { navController.popBackStack() },
                    onOpenChannel = { navController.navigate(Routes.chat(it)) },
                    onOpenMembers = { navController.navigate(CommunityRoutes.members(it)) },
                    onInvite = { navController.navigate(CommunityRoutes.invite(it)) },
                    onOpenSettings = { navController.navigate(CommunityRoutes.settings(it)) },
                    addChannelSheet = { id, onAdded, onDismiss -> CommunityAddChannelSheet(id, onAdded, onDismiss) },
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
