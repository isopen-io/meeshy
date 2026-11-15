package me.meeshy.app.navigation

import androidx.navigation.NavController
import androidx.navigation.NavDeepLinkRequest
import androidx.navigation.navOptions

/**
 * Les destinations de premier niveau gardent leur état (même sémantique que les onglets d'avant) : la destination
 * quittée est retirée en gardant le sien, celle qu'on rejoint retrouve le sien (`restoreState`).
 */
internal fun NavController.navigateToTopLevel(route: String) {
    navigate(route) {
        popUpTo(graph.startDestinationId) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

/**
 * Le Flux se quitte sans se perdre (#16676) : il est retiré de la pile en GARDANT son état — son ViewModel, sa liste,
 * la position de lecture —, que le prochain toucher du bouton Flux ([navigateToTopLevel]) restaure tel quel. C'est la
 * même bascule que celle du bouton : le retour système, un lien, une notification ou le jeu qui ramène aux
 * conversations ne recréent plus un fil neuf, remonté en tête.
 *
 * Seul le Flux est gardé : ce qui était empilé AU-DESSUS de lui (un profil, un réel, le composeur) est dépilé sans
 * état, comme avant, pour que rien d'autre ne ressuscite au prochain toucher du bouton. Les autres écrans dépilés
 * plus bas (une conversation remplacée par un lien) ne sont jamais gardés non plus. `false` si le Flux n'est pas
 * dans la pile.
 */
internal fun NavController.setFeedAside(): Boolean {
    if (currentBackStack.value.none { it.destination.route == Routes.FEED }) return false
    popBackStack(Routes.FEED, inclusive = false)
    return popBackStack(Routes.FEED, inclusive = true, saveState = true)
}

/** Ouvre [route] sur la liste des conversations (un lien, une notification, une conversation ouverte d'ailleurs), le Flux mis de côté. */
internal fun NavController.navigateOverConversations(route: String) {
    setFeedAside()
    navigate(route, overConversations)
}

/**
 * Le même chemin pour une adresse que les `navDeepLink` du graphe résolvent ; `false`, sans rien toucher à la pile,
 * quand aucune destination ne la porte.
 */
internal fun NavController.navigateOverConversations(request: NavDeepLinkRequest): Boolean {
    if (!graph.hasDeepLink(request)) return false
    setFeedAside()
    navigate(request, overConversations)
    return true
}

/** Revient à la liste des conversations, le Flux mis de côté ; `false` quand rien n'a été dépilé (la liste n'est pas dans la pile). */
internal fun NavController.backToConversations(): Boolean {
    val feedSetAside = setFeedAside()
    val popped = popBackStack(Routes.CONVERSATIONS, inclusive = false)
    return feedSetAside || popped
}

private val overConversations = navOptions {
    launchSingleTop = true
    popUpTo(Routes.CONVERSATIONS) { inclusive = false }
}
