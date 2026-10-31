package me.meeshy.app.game.notebook

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.game.progression.GamePageScaffold
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.PhotoLawEntry
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.game.MeeFigure
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.motion.staggeredAppear
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val NOTEBOOK_SKELETON_TAG = "game.notebook.skeleton"

/**
 * LA PAGE DE LA CHRONIQUE (iOS `GameNotebookPage`) — les étapes du jeu déjà franchies qui attendent leur photo, dans
 * l'ordre de leur piste : la première de chaque piste est ouverte, les suivantes, estompées et verrouillées, disent
 * laquelle prendre d'abord. Vide, Mee et Meo disent ce qui l'écrira. En bas, où vivent les photos : sur l'appareil.
 * Ni spinner (squelette à froid seulement) ni tirer-pour-rafraîchir : la page se lit dans le cache, hors ligne comme
 * en ligne.
 */
@Composable
fun GameNotebookScreen(onBack: () -> Unit, viewModel: GameNotebookViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    GamePageScaffold(
        title = stringResource(R.string.game_notebook_page_title),
        onBack = onBack,
        isRefreshing = false,
        onRefresh = null,
    ) {
        GameNotebookContent(state)
    }
}

@Composable
internal fun GameNotebookContent(state: GameNotebookUiState) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl)) {
        when {
            state.phase == GameNotebookPhase.Loading -> NotebookSkeleton()
            state.isEmpty -> NotebookEmpty()
            else -> CatchUpSection(state)
        }
        if (state.phase == GameNotebookPhase.Ready) {
            Text(
                stringResource(R.string.game_notebook_device_only),
                Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textMuted,
            )
        }
    }
}

@Composable
private fun NotebookSkeleton() {
    Column(Modifier.testTag(NOTEBOOK_SKELETON_TAG), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        repeat(SKELETON_ROWS) {
            MeeshySkeletonBox(Modifier.fillMaxWidth().height(72.dp), RoundedCornerShape(MeeshyRadius.md))
        }
    }
}

@Composable
private fun NotebookEmpty() {
    Column(
        Modifier.fillMaxWidth().padding(MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        MeeFigure(filmId = EMPTY_FILM, side = 96.dp, animates = false, modifier = Modifier.clearAndSetSemantics {})
        Text(
            stringResource(R.string.game_notebook_empty),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textMuted,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun CatchUpSection(state: GameNotebookUiState) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(
            stringResource(R.string.game_notebook_catch_up),
            Modifier.semantics { heading() },
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        state.catchUp.forEachIndexed { index, entry ->
            val blocker = entry.blockedBy?.let { id -> state.step(id)?.let { photoMomentTitle(it.step.emblem) } ?: id }
            CatchUpRow(entry, blocker, Modifier.staggeredAppear(minOf(index, MAX_STAGGER_RANK)))
        }
    }
}

@Composable
private fun CatchUpRow(entry: PhotoLawEntry, blocker: String?, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val title = photoMomentTitle(entry.step.emblem)
    val lockedLine = blocker?.let { stringResource(R.string.game_notebook_catch_up_locked, it) }
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(tokens.backgroundSecondary)
            .alpha(if (entry.isOpen) 1f else LOCKED_ALPHA)
            .padding(MeeshySpacing.md)
            .heightIn(min = 44.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = lockedLine?.let { "$title. $it" } ?: title
            },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                photoMomentKicker(entry.step.emblem).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = tokens.textMuted,
            )
            Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = tokens.textPrimary)
            if (lockedLine != null) {
                Text(lockedLine, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = tokens.textMuted)
            }
        }
        if (!entry.isOpen) {
            Icon(MeeshyIcons.Lock, contentDescription = null, tint = tokens.textMuted, modifier = Modifier.size(20.dp))
        }
    }
}

private const val EMPTY_FILM = "meo-selfie"
private const val SKELETON_ROWS = 3
private const val LOCKED_ALPHA = 0.55f
private const val MAX_STAGGER_RANK = 8
