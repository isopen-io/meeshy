package me.meeshy.app.game.gestures

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.progression.ProgressionConcept

/** Le concept a-t-il quelque chose à FAIRE dans sa fiche (iOS `ProgressionConceptGestures.exist`) ? */
internal fun conceptHasGestures(concept: ProgressionConcept, game: GameBlock?): Boolean = when (concept) {
    ProgressionConcept.Missions, ProgressionConcept.Flame, ProgressionConcept.Meesh -> game != null
    else -> false
}

/** Les gestes d'un concept, rangés dans sa fiche : chacun envoie une intention au `GameGesturesViewModel` et affiche ce que la passerelle rend. */
@Composable
internal fun ConceptGestures(concept: ProgressionConcept, game: GameBlock, viewModel: GameGesturesViewModel) {
    val gestures by viewModel.state.collectAsStateWithLifecycle()
    when (concept) {
        ProgressionConcept.Missions -> MissionsGestures(game, gestures, onReroll = viewModel::reroll, onClaim = viewModel::claimChest)
        ProgressionConcept.Meesh -> MintGestures(game, gestures, onMint = { viewModel.mint(game.mint) })
        ProgressionConcept.Flame -> FlamePanel(game, gestures, onBuyFreeze = viewModel::buyFreeze, onRelight = viewModel::relight)
        else -> Unit
    }
}
