package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.app.game.reveal.AchievementRevealScreen
import me.meeshy.app.navigation.graph.GameRoutes
import me.meeshy.sdk.game.EngagementRevealCoordinator
import me.meeshy.sdk.model.game.engagement.EngagementRevealQueue

@HiltViewModel
class EngagementRevealHostViewModel @Inject constructor(
    private val coordinator: EngagementRevealCoordinator,
) : ViewModel() {
    val queue: StateFlow<EngagementRevealQueue> = coordinator.queue

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
    val queue by viewModel.queue.collectAsStateWithLifecycle()
    val current = queue.current ?: return
    AchievementRevealScreen(
        reveal = current,
        onContinue = viewModel::finish,
        onSeeProgression = {
            navController.navigate(GameRoutes.PROGRESSION) { launchSingleTop = true }
            viewModel.finish()
        },
    )
}
