package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavHostController
import me.meeshy.app.feed.MoodLookup
import me.meeshy.app.feed.StatusesViewModel
import me.meeshy.ui.profile.LocalPeerMoodDirectory
import me.meeshy.ui.profile.LocalPeerMoodOpener
import me.meeshy.ui.profile.PeerMoodDirectory
import me.meeshy.ui.profile.PeerMoodOpener

/**
 * Les humeurs vivantes pour la conversation ouverte (iOS `statusViewModel.moodSpotlightHandler`,
 * #13987) : l'en-tête pose la boule de mood du pair et la toucher ouvre la page plein écran de
 * l'humeur, celle de la notification « nouvelle humeur ». Les statuts sont ceux du rail de la liste
 * quand elle est dans la pile — aucune seconde lecture ; sinon (lien profond) ceux de l'entrée.
 */
@Composable
internal fun ProvideConversationMoods(
    navController: NavHostController,
    entry: NavBackStackEntry,
    content: @Composable () -> Unit,
) {
    val owner = remember(entry) {
        runCatching { navController.getBackStackEntry(Routes.CONVERSATIONS) }.getOrDefault(entry)
    }
    val statusesViewModel: StatusesViewModel = hiltViewModel(owner)
    val statuses by statusesViewModel.state.collectAsStateWithLifecycle()
    val moods = remember(statuses.statuses, statuses.myStatus) { MoodLookup.from(statuses) }
    val directory = remember(moods) { PeerMoodDirectory(moods::peerMoodOf) }
    val opener = remember(navController) {
        PeerMoodOpener { mood -> navController.navigate(Routes.moodSpotlight(mood.statusId)) }
    }
    CompositionLocalProvider(
        LocalPeerMoodDirectory provides directory,
        LocalPeerMoodOpener provides opener,
        content = content,
    )
}
