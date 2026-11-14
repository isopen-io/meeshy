package me.meeshy.app.navigation

import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavHostController
import androidx.navigation.NavOptionsBuilder

/**
 * La garde de pile (#18365), celle de `UINavigationController` : pendant qu'un écran part, il ne pousse plus et ne
 * dépile plus rien. Un bouton passe l'entrée de la destination qui le monte ; si elle n'est plus au sommet (une
 * poussée déjà partie, une feuille posée dessus), l'appel est ignoré. Un double toucher n'empile donc qu'un écran,
 * un double retour n'en dépile qu'un.
 *
 * Règles d'écriture :
 *  - l'entrée passée est celle de la destination qui monte le bouton ;
 *  - une navigation déclenchée par un ÉVÉNEMENT (ViewModel, `LaunchedEffect`, lien, fin de connexion) passe par
 *    [navigateSingleTop] ou [AppNavigator], jamais par [pushFrom] : elle serait perdue si une feuille s'est posée ;
 *  - « dépiler puis pousser » devient UN [pushFrom] avec `popUpTo` (et `launchSingleTop` si la cible peut être
 *    dessous) : après le dépilage, l'entrée n'est plus au sommet.
 */
internal fun NavHostController.isOnTop(entry: NavBackStackEntry): Boolean = currentBackStackEntry?.id == entry.id

/**
 * Pousse [route] depuis [entry], ou rien si [entry] n'est plus au sommet. `launchSingleTop` n'est PAS forcé : il
 * remplacerait sur place une entrée de même motif (profil A vers profil B, conversation A vers B).
 */
internal fun NavHostController.pushFrom(entry: NavBackStackEntry, route: String, builder: NavOptionsBuilder.() -> Unit = {}) {
    if (isOnTop(entry)) navigate(route, builder)
}

/** Retire l'écran [entry], lui seul : la règle de [closeSheet], sous un nom d'écran. */
internal fun NavHostController.popFrom(entry: NavBackStackEntry) = closeSheet(entry)

/**
 * Revient à [route] depuis [entry] ; si [route] n'est pas dans la pile (on est arrivé par un lien profond), revient
 * aux conversations, comme le `popToRoot` d'iOS.
 */
internal fun NavHostController.popToOrRoot(entry: NavBackStackEntry, route: String) {
    if (!isOnTop(entry)) return
    if (!popBackStack(route, inclusive = false)) backToConversations()
}

/**
 * Pousse [route] depuis un hôte sans entrée (calque de la racine, rail) ou après un événement : la navigation atterrit
 * même si une feuille est au sommet. Seul le doublon EXACT est ignoré (même motif et mêmes arguments au sommet), pour
 * qu'un double toucher ou un événement rejoué n'empile pas deux fois le même écran ; une autre cible de même motif
 * s'empile par-dessus, au lieu de remplacer l'écran sur place comme `launchSingleTop`.
 */
internal fun NavHostController.navigateSingleTop(route: String, builder: NavOptionsBuilder.() -> Unit = {}) {
    val top = currentBackStackEntry?.filledRoute()
    if (top != null && top.withoutEmptyArguments() == route.withoutEmptyArguments()) return
    navigate(route, builder)
}

private fun String.withoutEmptyArguments(): String {
    val path = substringBefore('?')
    val query = substringAfter('?', missingDelimiterValue = "")
        .split('&')
        .filter { it.isNotEmpty() && !it.endsWith("=") }
        .sorted()
    return if (query.isEmpty()) path else path + "?" + query.joinToString("&")
}
