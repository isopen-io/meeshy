package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Saved-posts (bookmarked) feed — parity with iOS `BookmarksView`. Cache-less for
 * now (skeleton on cold open), cursor-paginated, with an optimistic un-bookmark that
 * pops the post out of the list instantly. Reuses the feed's [FeedPostPresentation]
 * projection so the Prisme language rendering matches the main feed.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookmarksScreen(
    onBack: () -> Unit = {},
    onPostClick: (String) -> Unit = {},
    viewModel: BookmarksViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val listState = rememberLazyListState()

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
                    title = {
                        Text(stringResource(R.string.bookmarks_title), fontWeight = FontWeight.Bold)
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.bookmarks_back),
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
                    state.showSkeleton -> BookmarksSkeleton()
                    state.posts.isEmpty() -> Box(
                        Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            stringResource(R.string.bookmarks_empty),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MeeshyTheme.tokens.textSecondary,
                        )
                    }
                    else -> LazyColumn(
                        state = listState,
                        contentPadding = PaddingValues(MeeshySpacing.lg),
                        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                    ) {
                        items(state.posts, key = { it.id }) { post ->
                            LaunchedEffect(post.id, state.posts.size) {
                                viewModel.loadMoreIfNeeded(post.id)
                            }
                            SavedPostCard(
                                post = post,
                                onRemove = { viewModel.removeBookmark(post.id) },
                                onClick = { if (post.isReel) onPostClick(post.id) },
                            )
                        }
                        if (state.isLoadingMore) {
                            item(key = "bookmarks_load_more") {
                                Box(
                                    Modifier
                                        .fillMaxWidth()
                                        .padding(MeeshySpacing.md),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    CircularProgressIndicator(
                                        strokeWidth = 2.dp,
                                        modifier = Modifier.size(24.dp),
                                        color = MeeshyPalette.Indigo500,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SavedPostCard(
    post: FeedPostPresentation,
    onRemove: () -> Unit,
    onClick: () -> Unit,
) {
    val unknownAuthor = stringResource(R.string.feed_unknown_author)
    MeeshyGlassSurface(
        shape = RoundedCornerShape(MeeshyRadius.xl),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Column(Modifier.padding(MeeshySpacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(contentAlignment = Alignment.Center) {
                    MeeshyAvatar(name = post.authorName ?: unknownAuthor, size = 40.dp)
                    if (!post.authorAvatarUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = post.authorAvatarUrl,
                            contentDescription = post.authorName ?: unknownAuthor,
                            modifier = Modifier
                                .size(40.dp)
                                .clip(CircleShape),
                        )
                    }
                }
                Spacer(Modifier.width(MeeshySpacing.md))
                Column(Modifier.weight(1f)) {
                    Text(
                        text = post.authorName ?: unknownAuthor,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = MeeshyTheme.tokens.textPrimary,
                    )
                }
                IconButton(onClick = onRemove) {
                    Icon(
                        imageVector = Icons.Filled.Bookmark,
                        contentDescription = stringResource(R.string.bookmarks_remove),
                        tint = MeeshyPalette.Indigo500,
                    )
                }
            }

            if (post.content.isNotBlank()) {
                Spacer(Modifier.height(MeeshySpacing.sm))
                SelectionContainer {
                    Text(
                        text = post.content,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MeeshyTheme.tokens.textPrimary,
                    )
                }
            }

            post.images.firstOrNull()?.let { image ->
                Spacer(Modifier.height(MeeshySpacing.md))
                AsyncImage(
                    model = image.url,
                    contentDescription = stringResource(R.string.feed_image_description),
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(1.4f)
                        .clip(RoundedCornerShape(MeeshyRadius.md))
                        .background(MeeshyPalette.Indigo500.copy(alpha = 0.08f)),
                )
            }

            if (post.isReel) {
                Spacer(Modifier.height(MeeshySpacing.md))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.semantics {
                        contentDescription = post.authorName ?: unknownAuthor
                    },
                ) {
                    Icon(
                        imageVector = Icons.Filled.PlayCircle,
                        contentDescription = null,
                        tint = MeeshyPalette.Indigo500,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(MeeshySpacing.xs))
                    Text(
                        text = stringResource(R.string.feed_reel),
                        style = MaterialTheme.typography.labelMedium,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
            }
        }
    }
}

@Composable
private fun BookmarksSkeleton() {
    LazyColumn(
        contentPadding = PaddingValues(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        items(6) {
            MeeshySkeletonBox(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(120.dp),
                shape = RoundedCornerShape(MeeshyRadius.xl),
            )
        }
    }
}
