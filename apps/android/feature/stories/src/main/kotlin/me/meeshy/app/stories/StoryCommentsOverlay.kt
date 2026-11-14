package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryComment
import me.meeshy.sdk.model.StoryCommentMenuPolicy
import me.meeshy.sdk.model.StoryCommentToggle
import me.meeshy.sdk.model.StoryCommentsZone
import me.meeshy.sdk.model.displayedText
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.icons.MeeshyIcons

/** Ce que l'overlay demande à son hôte, hors rangée ; une instance stable par overlay. */
internal class StoryCommentsOverlayActions(
    val row: StoryCommentRowCallbacks,
    val onToggleThread: (String) -> Unit,
    val onLoadMoreReplies: (String) -> Unit,
    val onLoadMoreRoots: () -> Unit,
)

/**
 * **Les commentaires par-dessus la scène** (iOS `StoryCommentsOverlayView`) : la moitié basse, SANS fond ni voile — la
 * story reste visible et interactive derrière —, des lignes plates séparées par des filets, un fondu en haut (masque
 * 0 / 0,4 / 1 à 12 % / 30 %) où les plus anciens se dissolvent. [frame] pose la liste sur le composeur ; les
 * commentaires restent lisibles quand la story est [isStoryExpired] (bannière au-dessus).
 */
@Composable
internal fun StoryCommentsOverlay(
    state: StoryCommentsUiState,
    isStoryExpired: Boolean,
    frame: StoryCommentsZone.Frame,
    targetCommentId: String?,
    targetParentCommentId: String?,
    actions: StoryCommentsOverlayActions,
    onListTop: (Float) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier.fillMaxSize()) {
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(bottom = frame.bottomInset.dp),
            verticalArrangement = Arrangement.Bottom,
        ) {
            if (isStoryExpired) StoryExpiredCommentsBanner()
            StoryCommentsList(state, frame, targetCommentId, targetParentCommentId, actions, onListTop)
        }
    }
}

@Composable
private fun StoryExpiredCommentsBanner() {
    Row(
        Modifier
            .padding(start = 28.dp, bottom = MeeshySpacing.xsPlus)
            .clip(CircleShape)
            .background(MeeshyPalette.Error.copy(alpha = 0.32f))
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xsPlus),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        Icon(MeeshyIcons.ScheduleFilled, contentDescription = null, tint = MeeshyMediaChromeColors.OnMediaSecondary, modifier = Modifier.size(14.dp))
        Text(
            stringResource(R.string.stories_comments_overlay_expired),
            style = TextStyle(color = MeeshyMediaChromeColors.OnMediaSecondary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold),
            maxLines = 2,
        )
    }
}

/** Le fondu du haut : l'alpha monte de 0 à 0,4 puis à 1 ; le bas reste plein pour la ligne qui touche le composeur. */
private fun Modifier.topFadeMask(): Modifier = this
    .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
    .drawWithContent {
        drawContent()
        drawRect(
            brush = Brush.verticalGradient(
                0f to Color.Transparent,
                0.12f to Color.Black.copy(alpha = 0.4f),
                0.30f to Color.Black,
                1f to Color.Black,
            ),
            blendMode = BlendMode.DstIn,
        )
    }

@Composable
private fun StoryCommentsList(
    state: StoryCommentsUiState,
    frame: StoryCommentsZone.Frame,
    targetCommentId: String?,
    targetParentCommentId: String?,
    actions: StoryCommentsOverlayActions,
    onListTop: (Float) -> Unit,
) {
    val thread = state.comments
    val listState = rememberLazyListState()
    StoryCommentsAutoScroll(listState, state, targetCommentId, targetParentCommentId)
    val nearEnd by remember { derivedNearEnd(listState) }
    LaunchedEffect(nearEnd, thread.rootCursor) { if (nearEnd && thread.canLoadMoreRoots) actions.onLoadMoreRoots() }
    LazyColumn(
        state = listState,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = frame.maxHeight.dp)
            .onGloballyPositioned { onListTop(it.positionInRoot().y) }
            .topFadeMask(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 28.dp, end = 80.dp, top = MeeshySpacing.xxl, bottom = MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        itemsFor(state, actions)
        if (state.isLoadingRoots) item(key = "loading", contentType = "loading") { StoryCommentsLoading() }
        if (thread.roots.isEmpty() && !state.isLoadingRoots) {
            item(key = "empty", contentType = "empty") { if (state.isOffline && !thread.hasLoaded) StoryCommentsError() else StoryCommentsEmpty() }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.itemsFor(state: StoryCommentsUiState, actions: StoryCommentsOverlayActions) {
    val thread = state.comments
    thread.roots.forEachIndexed { index, root ->
        item(key = root.id, contentType = "thread") {
            Column {
                if (index > 0) {
                    HorizontalDivider(
                        color = Color.White.copy(alpha = 0.28f),
                        modifier = Modifier.padding(vertical = MeeshySpacing.xs),
                    )
                }
                StoryCommentThreadBlock(state, root, actions)
            }
        }
    }
}

@Composable
private fun StoryCommentThreadBlock(state: StoryCommentsUiState, root: StoryComment, actions: StoryCommentsOverlayActions) {
    val thread = state.comments
    val replies = thread.thread.visibleReplies(root, thread.repliesOf(root.id))
    Column {
        StoryOverlayRow(state, root, actions)
        replies.forEach { reply ->
            Box(Modifier.padding(start = MeeshySpacing.xl)) { StoryOverlayRow(state, reply, actions) }
        }
        val toggle = thread.thread.toggle(root)
        if (toggle != null) {
            StoryThreadButton(
                label = when (toggle) {
                    StoryCommentToggle.Hide -> stringResource(R.string.stories_comments_overlay_hide_replies)
                    is StoryCommentToggle.SeeMore -> stringResource(R.string.stories_comments_overlay_show_replies)
                },
                loading = thread.thread.isLoading(root.id),
                onClick = { actions.onToggleThread(root.id) },
            )
        }
        if (thread.thread.isExpanded(root.id) && thread.thread.hasMoreReplies(root.id)) {
            StoryThreadButton(
                label = stringResource(R.string.stories_comments_overlay_more_replies),
                loading = thread.thread.isLoading(root.id),
                onClick = { actions.onLoadMoreReplies(root.id) },
            )
        }
    }
}

@Composable
private fun StoryOverlayRow(state: StoryCommentsUiState, comment: StoryComment, actions: StoryCommentsOverlayActions) {
    val showOriginal = comment.id in state.showingOriginal
    val menu = remember(comment.id, comment.content, comment.effectFlags, state.viewerId, state.viewerRole, state.commentsClosed, showOriginal) {
        StoryCommentMenuPolicy.actions(
            authorId = comment.authorId,
            viewerId = state.viewerId,
            platformRole = state.viewerRole,
            servedText = comment.displayedText(showOriginal),
            effectFlags = comment.effectFlags,
            commentsClosed = state.commentsClosed,
        )
    }
    StoryCommentRow(comment = comment, showOriginal = showOriginal, menu = menu, callbacks = actions.row)
}

@Composable
private fun StoryThreadButton(label: String, loading: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .heightIn(min = 48.dp)
            .clickable(enabled = !loading, onClick = onClick)
            .padding(start = 47.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        if (loading) CircularProgressIndicator(Modifier.size(12.dp), strokeWidth = 1.5.dp, color = MeeshyMediaChromeColors.OnMediaSecondary)
        Text(label, style = TextStyle(color = MeeshyMediaChromeColors.OnMediaSecondary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold))
    }
}

@Composable
private fun StoryCommentsLoading() {
    Box(Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.sm), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(
            Modifier.size(20.dp).semantics { liveRegion = LiveRegionMode.Polite },
            strokeWidth = 2.dp,
            color = MeeshyMediaChromeColors.OnMediaMuted,
        )
    }
}

/** L'état vide (iOS `emptyPlaceholder`) : le glyphe est décoratif, le libellé porte le sens. */
@Composable
private fun StoryCommentsEmpty() {
    Column(
        Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xxxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(MeeshyIcons.ChatBubbleOutline, contentDescription = null, tint = MeeshyMediaChromeColors.OnMediaMuted, modifier = Modifier.size(32.dp))
        Text(
            stringResource(R.string.stories_comments_empty_title),
            style = TextStyle(color = MeeshyMediaChromeColors.OnMediaSecondary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold),
        )
    }
}

/** Le premier chargement a échoué sur un cache vide : un message discret, jamais un écran d'erreur plein. */
@Composable
private fun StoryCommentsError() {
    Column(
        Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xxxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            stringResource(R.string.stories_comments_error),
            style = TextStyle(color = MeeshyMediaChromeColors.OnMediaSecondary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold),
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
}

/**
 * Le défilement automatique : un seul ciblage par montage (le commentaire d'une notification, ou son parent), puis la
 * liste se pose sur le dernier commentaire au premier chargement et le suit quand il en arrive un en direct.
 */
@Composable
private fun StoryCommentsAutoScroll(listState: LazyListState, state: StoryCommentsUiState, target: String?, targetParent: String?) {
    val roots = state.comments.roots
    var targeted by remember { mutableStateOf(false) }
    var settledSize by remember { mutableStateOf(0) }
    LaunchedEffect(roots.size, target, targetParent) {
        if (!targeted) {
            val anchor = listOfNotNull(target, targetParent).firstNotNullOfOrNull { id -> roots.indexOfFirst { it.id == id }.takeIf { it >= 0 } }
            if (anchor != null) {
                targeted = true
                settledSize = roots.size
                listState.animateScrollToItem(anchor)
                return@LaunchedEffect
            }
        }
        val grew = roots.size - settledSize
        val firstLoad = settledSize == 0 && roots.isNotEmpty() && target == null && targetParent == null
        val live = grew in 1..1 && !listState.canScrollForward
        settledSize = roots.size
        if (firstLoad || live) listState.animateScrollToItem(roots.lastIndex)
    }
}

private fun derivedNearEnd(listState: LazyListState) = androidx.compose.runtime.derivedStateOf {
    val info = listState.layoutInfo
    val last = info.visibleItemsInfo.lastOrNull()?.index ?: 0
    info.totalItemsCount > 0 && last >= info.totalItemsCount - 2
}
