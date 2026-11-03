package me.meeshy.ui.component.comments

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import me.meeshy.sdk.model.comments.CommentsSheetPhase
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * La liste des fils racine d'un contenu : la phase décide de ce qui se dessine (squelette à froid, erreur, vide, hors
 * ligne, lignes), les lignes sont clés par identifiant stable, et « Voir plus » pagine par curseur à la demande. Elle
 * se pose dans l'hôte qui défile (la feuille, le détail) ; chaque ligne porte déjà son fil de réponses dépliable.
 */
@Composable
public fun <T> CommentThreadList(
    state: CommentsListState,
    labels: CommentsSheetLabels,
    rows: List<T>,
    rowKey: (T) -> Any,
    onRetry: () -> Unit,
    onLoadMore: () -> Unit,
    skeleton: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    row: @Composable (T) -> Unit,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        if (state.showsOfflineBand) CommentsOfflineBand(labels.offline)
        when (state.phase) {
            CommentsSheetPhase.SKELETON -> skeleton()
            CommentsSheetPhase.ERROR -> CommentsErrorBanner(labels.loadError, labels.retry, onRetry)
            CommentsSheetPhase.OFFLINE_EMPTY -> CommentsOfflineEmptyBanner(labels.offlineEmpty)
            CommentsSheetPhase.EMPTY -> CommentsEmptyBanner(labels.empty)
            CommentsSheetPhase.CONTENT -> Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                rows.forEach { item -> key(rowKey(item)) { row(item) } }
            }
        }
        if (state.canLoadMore) {
            TextButton(onClick = onLoadMore, enabled = !state.isLoadingMore) {
                Text(labels.loadMore, color = MeeshyPalette.Indigo500)
            }
        }
    }
}
