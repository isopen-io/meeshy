package me.meeshy.app.game.pages

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.game.progression.GamePageScaffold
import me.meeshy.app.game.progression.ProgressionNoticeView
import me.meeshy.app.game.progression.ProgressionSkeleton
import me.meeshy.app.game.progression.ProgressionViewModel
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.progression.ProgressionNotice

/**
 * L'hôte d'une page du jeu (iOS `GameWave2Host`) : il lit la progression CACHE-FIRST — le dernier instantané se peint
 * tout de suite, la revalidation se fait en silence, le squelette n'apparaît qu'à froid — et distribue le bloc `game`.
 * Devant un serveur qui ne sert pas ce bloc, la page dit que cette partie du jeu n'est pas disponible plutôt que de se
 * peindre à moitié. Hors ligne, l'instantané reste affiché avec son avis.
 */
@Composable
internal fun GamePageHost(
    title: String,
    onBack: () -> Unit,
    viewModel: ProgressionViewModel = hiltViewModel(),
    content: @Composable ColumnScope.(GameBlock) -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snapshot = state.snapshot
    val game = snapshot?.game

    GamePageScaffold(
        title = title,
        onBack = onBack,
        isRefreshing = state.isRefreshing,
        onRefresh = viewModel::refresh,
    ) {
        state.plan.notices.filterNot { it == ProgressionNotice.Empty }
            .forEach { notice -> ProgressionNoticeView(notice, onRetry = viewModel::refresh) }
        if (state.plan.showsSkeleton) ProgressionSkeleton()
        when {
            game != null -> content(game)
            snapshot != null -> GameCard { GameNote(stringResource(R.string.game2_unavailable)) }
        }
    }
}
