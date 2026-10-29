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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
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
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.component.chrome.leadingNavigationIcon
import me.meeshy.ui.component.chrome.leadingNavigationLabel

/**
 * A single user's authored-posts feed — reached from a profile's "Publications" row.
 * Cache-less for now (skeleton on cold open), cursor-paginated, read-only. Reuses the
 * feed's [FeedPostPresentation] projection so the Prisme language rendering matches the
 * main feed; a reel taps through to the reels player, everything else is inert.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UserPostsScreen(
    onBack: () -> Unit = {},
    onPostClick: (String) -> Unit = {},
    onOpenPost: (String) -> Unit = {},
    viewModel: UserPostsViewModel = hiltViewModel(),
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
                        Text(stringResource(R.string.user_posts_title), fontWeight = FontWeight.Bold)
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                imageVector = leadingNavigationIcon(),
                                contentDescription = leadingNavigationLabel(stringResource(R.string.user_posts_back)),
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
                    state.showSkeleton -> UserPostsSkeleton()
                    state.posts.isEmpty() -> Box(
                        Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            stringResource(R.string.user_posts_empty),
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
                            UserPostCard(
                                modifier = Modifier.animateItem(),
                                post = post,
                                onClick = { if (post.isReel) onPostClick(post.id) else onOpenPost(post.id) },
                                onOpenPost = onOpenPost,
                                onOpenReel = onPostClick,
                            )
                        }
                        if (state.isLoadingMore) {
                            item(key = "user_posts_load_more") {
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
internal fun UserPostCard(
    modifier: Modifier = Modifier,
    post: FeedPostPresentation,
    onClick: () -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenReel: (String) -> Unit,
) {
    post.reelCover?.takeIf { post.showsReelCard }?.let { cover ->
        ReelPostCard(
            post = post,
            cover = cover,
            onOpenReel = onOpenReel,
            modifier = modifier,
        )
        return
    }
    val unknownAuthor = stringResource(R.string.feed_unknown_author)
    MeeshyGlassSurface(
        shape = RoundedCornerShape(MeeshyRadius.xl),
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Column(Modifier.padding(MeeshySpacing.lg)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                MeeshyAvatar(name = post.authorName ?: unknownAuthor, size = 40.dp, imageUrl = post.authorAvatarUrl, presence = rememberPresence(post.authorId))
                Spacer(Modifier.width(MeeshySpacing.md))
                Column(Modifier.weight(1f)) {
                    Text(
                        text = post.authorName ?: unknownAuthor,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = MeeshyTheme.tokens.textPrimary,
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

            FeedPostQuoteAndReel(post = post, onOpenPost = onOpenPost, onOpenReel = onOpenReel)
        }
    }
}

@Composable
private fun UserPostsSkeleton() {
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
