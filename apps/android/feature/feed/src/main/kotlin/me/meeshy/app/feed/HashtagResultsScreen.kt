package me.meeshy.app.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Les résultats d'un hashtag (iOS `HashtagResultsView`) : les cartes du fil, mêmes gestes,
 * pour les posts qui portent `#tag`. Cache-first (la dernière première page s'affiche tout de
 * suite), squelette à froid seulement, états vide et erreur dessinés.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HashtagResultsScreen(
    onBack: () -> Unit = {},
    onPostClick: (String) -> Unit = {},
    onOpenPost: (String) -> Unit = {},
    onOpenProfile: ((String) -> Unit)? = null,
    onOpenHashtag: (String) -> Unit = {},
    viewModel: HashtagResultsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val listState = rememberLazyListState()
    val haptics = LocalHapticFeedback.current

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let { snackbar.showSnackbar(it) }
    }

    MeeshyBackground {
        Scaffold(
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                    ),
                    title = { Text("#${state.tag}", fontWeight = FontWeight.Bold) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                imageVector = MeeshyIcons.Back,
                                contentDescription = stringResource(R.string.user_posts_back),
                                tint = MeeshyTheme.tokens.textPrimary,
                            )
                        }
                    },
                )
            },
            snackbarHost = { SnackbarHost(snackbar) },
            containerColor = Color.Transparent,
        ) { padding ->
            PullToRefreshBox(
                isRefreshing = state.isRefreshing,
                onRefresh = viewModel::refresh,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            ) {
                when {
                    state.showSkeleton -> FeedSkeleton()
                    state.posts.isEmpty() && state.loadFailed -> FeedErrorState(onRetry = viewModel::retry)
                    state.posts.isEmpty() -> HashtagEmptyState(state.tag)
                    else -> LazyColumn(
                        state = listState,
                        contentPadding = PaddingValues(MeeshySpacing.lg),
                        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                    ) {
                        items(state.posts, key = { it.id }, contentType = { HASHTAG_POST_CONTENT_TYPE }) { post ->
                            LaunchedEffect(post.id, state.posts.size) {
                                viewModel.loadMoreIfNeeded(post.id)
                            }
                            PostCard(
                                post = post,
                                modifier = Modifier.animateItem(),
                                onLike = {
                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    viewModel.toggleLike(post.id)
                                },
                                onBookmark = { viewModel.toggleBookmark(post.id) },
                                onFlagTap = {},
                                onClick = { if (post.isReel) onPostClick(post.id) else onOpenPost(post.id) },
                                onOpenPost = onOpenPost,
                                onOpenReel = onPostClick,
                                onImageTap = { if (post.isReel) onPostClick(post.id) else onOpenPost(post.id) },
                                isOwn = post.isAuthor,
                                onOpenProfile = onOpenProfile,
                                onOpenHashtag = onOpenHashtag,
                            )
                        }
                        if (state.isLoadingMore) {
                            item(key = "hashtag_load_more") { FeedLoadingMoreCards() }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HashtagEmptyState(tag: String) {
    FeedStatePane(
        icon = {
            Icon(
                MeeshyIcons.Tag,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(48.dp),
            )
        },
        title = stringResource(R.string.hashtag_results_empty, tag),
        subtitle = null,
    )
}

private const val HASHTAG_POST_CONTENT_TYPE = "hashtag_post"
