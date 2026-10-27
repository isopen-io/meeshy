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
import me.meeshy.app.conversations.links.AffiliateScreen
import me.meeshy.app.conversations.links.CommunityLinkDetailScreen
import me.meeshy.app.conversations.links.CommunityLinkDetailViewModel
import me.meeshy.app.conversations.links.CommunityLinksScreen
import me.meeshy.app.conversations.links.LinksHubScreen
import me.meeshy.app.conversations.links.TrackingLinkDetailScreen
import me.meeshy.app.conversations.links.TrackingLinkDetailViewModel
import me.meeshy.app.conversations.links.TrackingLinksScreen
import me.meeshy.app.navigation.Routes
import me.meeshy.sdk.model.links.LinksHubEntry

/** Les routes de « Mes liens » : le hub, le suivi (liste + fiche), les communautés (liste + fiche) et le parrainage. */
object LinksRoutes {
    const val CREATE_ARG = "create"

    const val HUB = "links"
    const val TRACKING = "tracking-links?$CREATE_ARG={$CREATE_ARG}"
    const val TRACKING_DETAIL = "tracking-links/{${TrackingLinkDetailViewModel.TOKEN_ARG}}"
    const val COMMUNITY = "community-links"
    const val COMMUNITY_DETAIL = "community-links/{${CommunityLinkDetailViewModel.COMMUNITY_ID_ARG}}"
    const val AFFILIATE = "affiliate?$CREATE_ARG={$CREATE_ARG}"

    fun tracking(create: Boolean = false): String = "tracking-links?$CREATE_ARG=$create"

    fun trackingDetail(token: String): String = "tracking-links/$token"

    fun communityDetail(communityId: String): String = "community-links/$communityId"

    fun affiliate(create: Boolean = false): String = "affiliate?$CREATE_ARG=$create"
}

/**
 * Les destinations de « Mes liens » (iOS `LinksHubView` et ses écrans), contribuées au `NavHost` racine sans
 * éditer `MeeshyApp` : le barreau « Mes liens » du menu flottant ouvre le hub. Les liens de partage
 * (`MyShareLinksScreen` et sa fiche) restent ceux du graphe des conversations.
 */
class LinksDestinations @Inject constructor() : NavGraphContributor {
    override fun contribute(builder: NavGraphBuilder, navController: NavHostController) {
        builder.composable(LinksRoutes.HUB) {
            LinksHubScreen(
                onBack = { navController.popBackStack() },
                onOpen = { entry ->
                    navController.navigate(
                        when (entry) {
                            LinksHubEntry.SHARE -> Routes.MY_SHARE_LINKS
                            LinksHubEntry.TRACKING -> LinksRoutes.tracking()
                            LinksHubEntry.COMMUNITY -> LinksRoutes.COMMUNITY
                            LinksHubEntry.AFFILIATE -> LinksRoutes.affiliate()
                        },
                    )
                },
                onCreate = { entry ->
                    navController.navigate(
                        when (entry) {
                            LinksHubEntry.SHARE -> Routes.SHARE_LINK_PICKER
                            LinksHubEntry.TRACKING -> LinksRoutes.tracking(create = true)
                            LinksHubEntry.COMMUNITY -> CommunityRoutes.CREATE
                            LinksHubEntry.AFFILIATE -> LinksRoutes.affiliate(create = true)
                        },
                    )
                },
            )
        }
        builder.composable(
            route = LinksRoutes.TRACKING,
            arguments = listOf(createArgument()),
        ) { entry ->
            TrackingLinksScreen(
                onBack = { navController.popBackStack() },
                onOpenLink = { navController.navigate(LinksRoutes.trackingDetail(it.token)) },
                openCreate = entry.arguments?.getBoolean(LinksRoutes.CREATE_ARG) == true,
            )
        }
        builder.composable(
            route = LinksRoutes.TRACKING_DETAIL,
            arguments = listOf(navArgument(TrackingLinkDetailViewModel.TOKEN_ARG) { type = NavType.StringType }),
        ) {
            TrackingLinkDetailScreen(onBack = { navController.popBackStack() })
        }
        builder.composable(LinksRoutes.COMMUNITY) {
            CommunityLinksScreen(
                onBack = { navController.popBackStack() },
                onOpenLink = { navController.navigate(LinksRoutes.communityDetail(it.id)) },
                onCreateCommunity = { navController.navigate(CommunityRoutes.CREATE) },
            )
        }
        builder.composable(
            route = LinksRoutes.COMMUNITY_DETAIL,
            arguments = listOf(navArgument(CommunityLinkDetailViewModel.COMMUNITY_ID_ARG) { type = NavType.StringType }),
        ) {
            CommunityLinkDetailScreen(onBack = { navController.popBackStack() })
        }
        builder.composable(
            route = LinksRoutes.AFFILIATE,
            arguments = listOf(createArgument()),
        ) { entry ->
            AffiliateScreen(
                onBack = { navController.popBackStack() },
                openCreate = entry.arguments?.getBoolean(LinksRoutes.CREATE_ARG) == true,
            )
        }
    }

    private fun createArgument() = navArgument(LinksRoutes.CREATE_ARG) {
        type = NavType.BoolType
        defaultValue = false
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface LinksDestinationsModule {
    @Binds
    @IntoSet
    fun bind(contributor: LinksDestinations): NavGraphContributor
}
