package me.meeshy.ui.component.comments

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.comments.CommentsSheetPhase

/** Les libellés que l'hôte fournit à la feuille (ils viennent des chaînes générées depuis iOS, jamais écrits ici). */
@Immutable
public data class CommentsSheetLabels(
    val title: String,
    val closeLabel: String,
    val loadError: String,
    val retry: String,
    val empty: String,
    val offline: String,
    val offlineEmpty: String,
    val loadMore: String,
)

/**
 * Ce que [CommentThreadList] dessine : la phase dérivée par `CommentsUiStateReducer`, rien d'autre. Le squelette ne vit
 * que dans la phase [CommentsSheetPhase.SKELETON] (cache vide à froid).
 */
@Immutable
public data class CommentsListState(
    val phase: CommentsSheetPhase,
    val showsOfflineBand: Boolean = false,
    val canLoadMore: Boolean = false,
    val isLoadingMore: Boolean = false,
)
