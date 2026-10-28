package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import me.meeshy.sdk.game.EngagementRevealCoordinator
import me.meeshy.sdk.model.game.engagement.EngagementReveal

@HiltViewModel
class EngagementRevealHostViewModel @Inject constructor(
    private val coordinator: EngagementRevealCoordinator,
) : ViewModel() {
    /** La célébration à l'écran — rien hors du compte qui l'a reçue, rien sous « Jeu masqué ». */
    val current: StateFlow<EngagementReveal?> =
        coordinator.showing.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    /** L'UNIQUE chemin qui fait avancer la file : la fermeture, qu'elle vienne du voile, du retour ou d'un bouton. */
    fun finish() = coordinator.finish()
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
    // Une célébration par palier : le suivant de la file repart de zéro (entrée, halo, haptique), jamais de l'état final du précédent.
    key(current) {
        AchievementRevealScreen(
            reveal = current,
            onContinue = viewModel::finish,
            onSeeProgression = {
                navController.navigate(GameRoutes.PROGRESSION) { launchSingleTop = true }
                viewModel.finish()
            },
        )
    }
}
