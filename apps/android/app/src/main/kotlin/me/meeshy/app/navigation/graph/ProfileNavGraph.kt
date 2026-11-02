package me.meeshy.app.navigation.graph

import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.navigation.ProfileRouteGateViewModel
import me.meeshy.app.navigation.ProfileRoutes
import me.meeshy.app.navigation.Routes
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.ui.profile.LocalProfileSheetOpener

/** Ce que la destination `profile/{userId}` fait de sa cible. */
internal sealed interface ProfileEntryAction {
    /** La cible me désigne (id OU pseudo) : ma page éditable, par la règle unique [ProfileRoutes.profileFor]. */
    data object OwnPage : ProfileEntryAction

    /** Un tiers : sa fiche s'ouvre en feuille par-dessus l'écran d'où l'on vient. */
    data class Sheet(val user: ProfileSheetUser) : ProfileEntryAction

    /** Cible vide : rien à ouvrir, la destination se retire. */
    data object Ignore : ProfileEntryAction
}

internal object ProfileRouteEntry {
    fun resolve(target: String, isSelf: Boolean): ProfileEntryAction {
        val handle = target.trim()
        return when {
            handle.isEmpty() -> ProfileEntryAction.Ignore
            isSelf -> ProfileEntryAction.OwnPage
            else -> ProfileEntryAction.Sheet(ProfileSheetUser.from(handle))
        }
    }
}

/**
 * `profile/{userId}`, `meeshy://profile/{id}`, `meeshy://u/{pseudo}` et `https://meeshy.me/u/{pseudo}`
 * restent des points d'entrée, mais n'ont plus d'écran : la destination ouvre la fiche en feuille par
 * l'ouvreur global puis se retire de la pile. À froid, la pile synthétique du lien profond laisse
 * donc la feuille ouverte sur la liste des conversations.
 */
class ProfileNavGraph @Inject constructor() : NavGraphContributor {
    override fun contribute(builder: NavGraphBuilder, navController: NavHostController) {
        builder.composable(
            route = Routes.PROFILE_USER,
            arguments = listOf(navArgument(USER_ID_ARG) { type = NavType.StringType }),
            deepLinks = listOf(
                navDeepLink { uriPattern = Routes.PROFILE_DEEP_LINK },
                navDeepLink { uriPattern = Routes.PROFILE_SHARE_APP_DEEP_LINK },
                navDeepLink { uriPattern = Routes.PROFILE_SHARE_WEB_DEEP_LINK },
            ),
            enterTransition = { EnterTransition.None },
            exitTransition = { ExitTransition.None },
            popEnterTransition = { EnterTransition.None },
            popExitTransition = { ExitTransition.None },
        ) { entry ->
            ProfileRouteEntryEffect(entry = entry, navController = navController)
        }
    }

    private companion object {
        const val USER_ID_ARG = "userId"
    }
}

@Composable
private fun ProfileRouteEntryEffect(entry: NavBackStackEntry, navController: NavHostController) {
    val gate: ProfileRouteGateViewModel = hiltViewModel()
    val opener = LocalProfileSheetOpener.current
    LaunchedEffect(entry.id) {
        val target = entry.arguments?.getString("userId").orEmpty()
        val destinationId = entry.destination.id
        when (val action = ProfileRouteEntry.resolve(target, gate.resolvesToSelf(target))) {
            ProfileEntryAction.OwnPage -> navController.navigate(ProfileRoutes.OWN) {
                popUpTo(destinationId) { inclusive = true }
            }
            is ProfileEntryAction.Sheet -> {
                opener.open(action.user)
                navController.popBackStack(destinationId, inclusive = true)
            }
            ProfileEntryAction.Ignore -> navController.popBackStack(destinationId, inclusive = true)
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface ProfileNavGraphModule {
    @Binds
    @IntoSet
    fun bind(graph: ProfileNavGraph): NavGraphContributor
}
