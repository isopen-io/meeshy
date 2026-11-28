package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.MeeshyEmptyState
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private const val SKELETON_CARDS = 3

/** Ce que l'onglet Publications ouvre : un post sur son détail, un réel dans le lecteur, un auteur, un mot-dièse. */
data class CommunityPostsNavigation(
    val onOpenPost: (String) -> Unit,
    val onOpenReel: (String) -> Unit,
    val onOpenProfile: ((String) -> Unit)? = null,
    val onOpenHashtag: (String) -> Unit = {},
)

/**
 * Les éléments de l'onglet Publications d'une communauté (#16879, iOS `CommunityPostsTab`), à verser DANS le
 * défilement unique du détail : jamais un second défilement imbriqué. La carte est celle du fil, avec ses gestes ;
 * chaque état a son dessin — squelette sur cache vide seulement, vide, échec avec « Réessayer ». Le contenu est
 * injecté par `:app`, la feature des communautés restant isolée de celle du fil. [snackbar] reçoit les retours
 * des gestes des cartes (lien copié, signalement…).
 */
@Composable
fun rememberCommunityPostsItems(
    communityId: String,
    snackbar: SnackbarHostState,
    navigation: CommunityPostsNavigation,
): LazyListScope.() -> Unit {
    val viewModel: CommunityPostsViewModel = hiltViewModel(key = "community-posts-$communityId")
    LaunchedEffect(communityId) { viewModel.bind(communityId) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    val sheets = rememberListedPostSheets()
    val share = rememberListedPostShare(snackbar)
    ListedPostOverlays(
        sheets = sheets,
        actions = viewModel.cards,
        quoteComposer = state.quoteComposer,
        notice = state.notice,
        commentCount = { id -> state.posts.firstOrNull { it.id == id }?.commentCount ?: 0 },
        commentsClosed = { id -> state.posts.firstOrNull { it.id == id }?.commentsClosed },
        snackbar = snackbar,
    )
    val loading = stringResource(R.string.community_posts_loading)
    return {
        communityPostsItems(
            state = state,
            loadingLabel = loading,
            onRetry = viewModel::retry,
            onCardAppeared = viewModel::loadMoreIfNeeded,
        ) { post, modifier ->
            ListedPostCard(
                post = post,
                actions = viewModel.cards,
                sheets = sheets,
                share = share,
                onOpenPost = navigation.onOpenPost,
                onOpenReel = navigation.onOpenReel,
                onOpenProfile = navigation.onOpenProfile,
                onOpenHashtag = navigation.onOpenHashtag,
                modifier = modifier,
            )
        }
    }
}

internal fun LazyListScope.communityPostsItems(
    state: CommunityPostsUiState,
    loadingLabel: String,
    onRetry: () -> Unit,
    onCardAppeared: (String) -> Unit,
    card: @Composable (FeedPostPresentation, Modifier) -> Unit,
) {
    if (state.showSkeleton) {
        items(SKELETON_CARDS, key = { "community-posts-skeleton-$it" }, contentType = { "community-posts-skeleton" }) { index ->
            MeeshySkeletonBox(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.xl)
                    .padding(top = MeeshySpacing.md)
                    .height(120.dp)
                    .then(if (index == 0) Modifier.semantics { contentDescription = loadingLabel } else Modifier),
                shape = RoundedCornerShape(MeeshyRadius.xl),
            )
        }
    }
    items(state.posts, key = { "community-post-${it.id}" }, contentType = { if (it.showsReelCard) "reel" else "post" }) { post ->
        LaunchedEffect(post.id, state.posts.size) { onCardAppeared(post.id) }
        card(post, Modifier.padding(horizontal = MeeshySpacing.xl).padding(top = MeeshySpacing.md))
    }
    if (state.isLoadingMore) {
        item(key = "community-posts-loading-more", contentType = "community-posts-loading") {
            Box(Modifier.fillMaxWidth().padding(MeeshySpacing.md), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(24.dp), color = MeeshyPalette.Indigo500)
            }
        }
    }
    if (state.isEmpty) {
        item(key = "community-posts-empty", contentType = "community-posts-placeholder") {
            Box(Modifier.fillMaxWidth().height(220.dp)) {
                MeeshyEmptyState(
                    icon = MeeshyIcons.PhotoLibrary,
                    title = stringResource(R.string.community_posts_empty_title),
                    subtitle = "",
                    compact = true,
                )
            }
        }
    }
    if (state.failed) {
        item(key = "community-posts-failed", contentType = "community-posts-placeholder") {
            Box(Modifier.fillMaxWidth().height(220.dp)) {
                MeeshyEmptyState(
                    icon = MeeshyIcons.WarningFilled,
                    title = stringResource(R.string.community_posts_failed_title),
                    subtitle = "",
                    actionLabel = stringResource(R.string.community_posts_retry),
                    onAction = onRetry,
                    compact = true,
                )
            }
        }
    }
}
