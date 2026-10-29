package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.launch
import me.meeshy.app.game.reveal.shareAchievementCard
import androidx.compose.runtime.key
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import me.meeshy.app.game.reveal.AchievementRevealScreen
import me.meeshy.app.navigation.graph.GameRoutes
import me.meeshy.sdk.game.EngagementRevealPresentation
import me.meeshy.sdk.game.EngagementRevealPresenter

@HiltViewModel
class EngagementRevealHostViewModel @Inject constructor(
    private val presenter: EngagementRevealPresenter,
) : ViewModel() {
    /**
     * La célébration à l'écran avec sa rareté, lue AVANT qu'elle ne se présente — rien hors du compte qui l'a reçue,
     * rien sous « Jeu masqué ».
     */
    val current: StateFlow<EngagementRevealPresentation?> =
        presenter.presentation.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    /** L'UNIQUE chemin qui fait avancer la file : la fermeture, qu'elle vienne du voile, du retour ou d'un bouton. */
    fun finish() = presenter.finish()
}

/**
 * **L'hôte de la célébration — monté UNE fois, à la racine** (miroir d'`EngagementRevealHost`, iOS). La révélation
 * COUVRE l'écran où l'on se trouve : le toucher d'une notification a déjà poussé son écran, la fermer y laisse
 * arriver ; « Voir ma progression » pousse la première page du jeu AVANT de refermer, pour ARRIVER plutôt que de voir
 * la pile bouger.
 */
@Composable
fun EngagementRevealHost(navController: NavHostController, viewModel: EngagementRevealHostViewModel = hiltViewModel()) {
    val shown by viewModel.current.collectAsStateWithLifecycle()
    val current = shown ?: return
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // Une célébration par palier : le suivant de la file repart de zéro (entrée, halo, haptique), jamais de l'état final du précédent.
    // La clé est le PALIER : une rareté lue après coup ne rejouerait pas l'entrée.
    key(current.reveal) {
        AchievementRevealScreen(
            reveal = current.reveal,
            onContinue = viewModel::finish,
            onSeeProgression = {
                navController.navigate(GameRoutes.PROGRESSION) { launchSingleTop = true }
                viewModel.finish()
            },
            rarity = current.rarity,
            // La carte du succès est une proposition de photo : « Jeu masqué » et « Célébrations » coupées la retirent.
            onPhoto = if (current.offersPhotos) {
                { moment -> scope.launch { shareAchievementCard(context, moment, current.authorHandle) } }
            } else {
                null
            },
        )
    }
}
