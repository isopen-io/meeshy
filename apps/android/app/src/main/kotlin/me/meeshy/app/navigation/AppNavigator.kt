package me.meeshy.app.navigation

import androidx.compose.foundation.systemGestureExclusion
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavController
import androidx.navigation.NavHostController
import dagger.hilt.android.lifecycle.HiltViewModel
import me.meeshy.app.navigation.graph.CommunityRoutes
import me.meeshy.app.navigation.graph.LinksRoutes
import me.meeshy.sdk.model.navigation.NavigationHubRule
import me.meeshy.sdk.model.navigation.NavigationHubRule.Decision
import javax.inject.Inject

/** Le routeur de la racine, pour les écrans et les calques qui n'ont pas reçu le contrôleur ; `null` hors de [MeeshyApp]. */
val LocalAppNavigator = staticCompositionLocalOf<AppNavigator?> { null }

@HiltViewModel
class AppNavigatorViewModel @Inject constructor(
    val surfaces: PresentedSurfaceRegistry,
    val requests: NavigationRequests,
) : ViewModel()

/**
 * **LE routeur de l'application** (iOS `Router`) : tout ce qui change la pile passe ici.
 *
 *  - une route égale à l'écran courant est ignorée ; une autre cible de même motif s'empile (iOS `Router.push`) ;
 *  - renaviguer vers un HUB déjà empilé dépile jusqu'à lui au lieu d'en poser un second ([NavigationHubRule]) ;
 *  - une conversation s'ouvre d'abord en libérant l'écran : les surfaces de sa fenêtre se referment, celles qui
 *    retiennent un travail (composeur, partie de jeu) restent et l'ouverture attend leur départ
 *    ([PresentedSurfaceRegistry]) ;
 *  - aucun retour n'est possible à la racine.
 */
class AppNavigator internal constructor(
    private val controller: NavHostController,
    private val tracker: RouteTracker,
    private val surfaces: PresentedSurfaceRegistry,
    val requests: NavigationRequests,
    private val rule: NavigationHubRule = HUB_RULE,
) {
    /** La route résolue de l'écran courant, pour ceux qui doivent savoir où l'on est. */
    val currentRoute: String? get() = tracker.current.value

    fun navigate(route: String) {
        when (val decision = rule.decide(tracker.resolvedStack, route)) {
            Decision.Ignore -> Unit
            Decision.Push -> push(route)
            is Decision.PopTo -> {
                val hub = tracker.stack.getOrNull(decision.index)?.pattern
                // Le miroir n'est qu'un indice : si la pile réelle ne porte plus le hub, on l'empile.
                if (hub == null || !controller.popBackStack(hub, inclusive = false)) push(route)
            }
        }
    }

    /** Ouvre une conversation, [highlightMessageId] étant le message où atterrir (porté par la route). */
    fun openConversation(conversationId: String, highlightMessageId: String? = null) {
        surfaces.clearForConversation { navigate(Routes.chat(conversationId, highlightMessageId)) }
    }

    /** [navigate] depuis le bouton de l'écran [entry] : ignoré si [entry] n'est plus au sommet (double toucher). */
    fun navigateFrom(entry: NavBackStackEntry, route: String) {
        if (controller.isOnTop(entry)) navigate(route)
    }

    /** [openConversation] depuis le bouton de l'écran [entry] : ignoré si [entry] n'est plus au sommet. */
    fun openConversationFrom(entry: NavBackStackEntry, conversationId: String, highlightMessageId: String? = null) {
        if (controller.isOnTop(entry)) openConversation(conversationId, highlightMessageId)
    }

    /** Retour d'une page ; `false` à la racine, où il n'y a rien à dépiler. */
    fun pop(): Boolean = controller.previousBackStackEntry != null && controller.popBackStack()

    /**
     * Sans `launchSingleTop` : Navigation compare la destination, pas les arguments, et une conversation B ouverte
     * depuis A remplacerait A sur place (son ViewModel gardé, le retour vers A perdu). Le doublon exact est déjà
     * [Decision.Ignore], le suivi étant mis à jour par l'écouteur de destination.
     */
    private fun push(route: String) = controller.navigate(route)

    companion object {
        /** Les écrans que le menu ouvre : un seul exemplaire dans la pile, comme `Route.isHub` d'iOS. */
        internal val HUB_RULE = NavigationHubRule(
            setOf(
                Routes.SETTINGS,
                Routes.CONTACTS,
                Routes.CONTACTS_DISCOVER,
                Routes.NOTIFICATIONS,
                CommunityRoutes.LIST,
                LinksRoutes.HUB,
            ),
        )
    }
}

/** Le routeur de la racine, lié au contrôleur : son suivi écoute CHAQUE changement de destination. */
@Composable
fun rememberAppNavigator(
    navController: NavHostController,
    viewModel: AppNavigatorViewModel = hiltViewModel(),
): AppNavigator {
    val tracker = remember(navController) { RouteTracker() }
    DisposableEffect(navController, tracker) {
        val listener = NavController.OnDestinationChangedListener { controller, destination, arguments ->
            val entryId = controller.currentBackStackEntry?.id ?: destination.id.toString()
            tracker.onDestinationChanged(entryId, destination.route) { name -> arguments?.getString(name) }
        }
        navController.addOnDestinationChangedListener(listener)
        onDispose { navController.removeOnDestinationChangedListener(listener) }
    }
    return remember(navController, tracker, viewModel) {
        AppNavigator(navController, tracker, viewModel.surfaces, viewModel.requests)
    }
}

/**
 * Une zone qui défile à l'horizontale (carrousel, plateau, curseur) sort du geste « retour » du système : un balayage
 * qui la parcourt ne referme pas l'écran. Le retour prédictif reste armé partout ailleurs.
 */
fun Modifier.excludeFromSystemBack(): Modifier = systemGestureExclusion()
