package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import me.meeshy.app.navigation.graph.ProfileEntryAction
import me.meeshy.app.navigation.graph.ProfileRouteEntry
import me.meeshy.ui.profile.LocalProfileSheetOpener
import me.meeshy.ui.profile.ProfileSheetOpener

/**
 * Toucher une personne DANS une feuille (#13369) ouvre sa fiche PAR-DESSUS la feuille, comme le `.sheet` empilé
 * d'iOS : fermer la fiche ramène à la feuille. Passer par la route `profile/{userId}` ne le permet pas — c'est un
 * `composable`, et Navigation retire toute feuille (`dialog`) de la pile avant d'en empiler un : la recherche ou
 * la liste des bloqués disparaissaient sous la fiche. Ma propre page reste un écran empilé ([navigateOwn]).
 */
internal fun openProfileOverSheet(
    target: String,
    isSelf: (String) -> Boolean,
    opener: ProfileSheetOpener,
    navigateOwn: () -> Unit,
) {
    when (val action = ProfileRouteEntry.resolve(target, isSelf(target.trim()))) {
        ProfileEntryAction.OwnPage -> navigateOwn()
        is ProfileEntryAction.Sheet -> opener.open(action.user)
        ProfileEntryAction.Ignore -> Unit
    }
}

@Composable
internal fun rememberProfileOpenerOverSheet(navController: NavHostController): (String) -> Unit {
    val gate: ProfileRouteGateViewModel = hiltViewModel()
    val opener = LocalProfileSheetOpener.current
    return remember(gate, opener, navController) {
        { target ->
            openProfileOverSheet(
                target = target,
                isSelf = gate::resolvesToSelf,
                opener = opener,
                navigateOwn = { navController.navigate(ProfileRoutes.OWN) },
            )
        }
    }
}
