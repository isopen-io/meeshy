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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.format.shortDateTimeLabel
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(
    onPostClick: (String) -> Unit = {},
    viewModel: FeedViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }

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
                    Text(stringResource(R.string.feed_title), fontWeight = FontWeight.Bold)
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
        containerColor = Color.Transparent,
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = state.isSyncing,
            onRefresh = viewModel::refresh,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            when {
                state.showSkeleton -> FeedSkeleton()
                state.posts.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        stringResource(R.string.feed_empty),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
                else -> LazyColumn(
                    contentPadding = PaddingValues(MeeshySpacing.lg),
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                ) {
                    items(state.posts, key = { it.id }) { post ->
                        LaunchedEffect(post.id, state.posts.size) {
                            viewModel.loadMoreIfNeeded(post.id)
                        }
                        PostCard(
                            post = post,
                            onLike = { viewModel.toggleLike(post.id) },
                            // Only reels open the full-screen reel overlay; regular
                            // posts have no detail screen yet, so tapping is inert.
                            onClick = { if (post.isReel) onPostClick(post.id) },
                        )
                    }
                    if (state.isLoadingMore) {
                        item(key = "feed_load_more") {
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
private fun PostCard(
    post: FeedPostPresentation,
    onLike: () -> Unit,
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
                    MeeshyAvatar(
                        name = post.authorName ?: unknownAuthor,
                        size = 40.dp,
                    )
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
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = post.authorName ?: unknownAuthor,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                            color = MeeshyTheme.tokens.textPrimary,
                        )
                        if (post.moodEmoji != null) {
                            Text(
                                text = post.moodEmoji,
                                modifier = Modifier.padding(start = MeeshySpacing.xs),
                            )
                        }
                    }
                    post.createdAtIso?.let {
                        Text(
                            text = shortDateTimeLabel(it),
                            style = MaterialTheme.typography.bodySmall,
                            color = MeeshyTheme.tokens.textSecondary,
                        )
                    }
                }
            }

            if (post.content.isNotBlank()) {
                Spacer(Modifier.height(MeeshySpacing.md))
                SelectionContainer {
                    Text(
                        text = post.content,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MeeshyTheme.tokens.textPrimary,
                    )
                }
            }

            if (post.isTranslated) {
                Spacer(Modifier.height(MeeshySpacing.xs))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Filled.Translate,
                        contentDescription = null,
                        tint = MeeshyTheme.tokens.textSecondary,
                        modifier = Modifier.size(14.dp),
                    )
                    Text(
                        text = stringResource(R.string.feed_translated),
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyTheme.tokens.textSecondary,
                        modifier = Modifier.padding(start = MeeshySpacing.xs),
                    )
                }
            }

            if (post.images.isNotEmpty()) {
                Spacer(Modifier.height(MeeshySpacing.md))
                PostImageGrid(images = post.images)
            }

            if (post.isReel) {
                Spacer(Modifier.height(MeeshySpacing.md))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp)
                        .clip(RoundedCornerShape(MeeshyRadius.lg))
                        .background(MeeshyPalette.Indigo500.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Filled.PlayCircle,
                            contentDescription = null,
                            tint = MeeshyPalette.Indigo500,
                            modifier = Modifier.size(48.dp),
                        )
                        Text(
                            text = stringResource(R.string.feed_reel),
                            style = MaterialTheme.typography.labelMedium,
                            color = MeeshyTheme.tokens.textSecondary,
                            modifier = Modifier.padding(top = MeeshySpacing.xs),
                        )
                    }
                }
            }

            Spacer(Modifier.height(MeeshySpacing.sm))
            PostStatsRow(post = post, onLike = onLike)
        }
    }
}

private const val MAX_GRID_IMAGES = 4

@Composable
private fun PostImageGrid(images: List<FeedPostImage>) {
    val shape = RoundedCornerShape(MeeshyRadius.md)
    if (images.size == 1) {
        val image = images.first()
        AsyncImage(
            model = image.url,
            contentDescription = stringResource(R.string.feed_image_description),
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(imageAspectRatio(image))
                .clip(shape)
                .background(MeeshyPalette.Indigo500.copy(alpha = 0.08f)),
        )
        return
    }
    val visible = images.take(MAX_GRID_IMAGES)
    val hiddenCount = images.size - visible.size
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        visible.chunked(2).forEachIndexed { rowIndex, row ->
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
                row.forEachIndexed { columnIndex, image ->
                    val imageIndex = rowIndex * 2 + columnIndex
                    val isLastCell = hiddenCount > 0 && imageIndex == visible.lastIndex
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .aspectRatio(1f)
                            .clip(shape)
                            .background(MeeshyPalette.Indigo500.copy(alpha = 0.08f)),
                    ) {
                        AsyncImage(
                            model = image.thumbnailUrl ?: image.url,
                            contentDescription = stringResource(R.string.feed_image_description),
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                        if (isLastCell) {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(Color.Black.copy(alpha = 0.45f)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text = stringResource(R.string.feed_hidden_images, hiddenCount),
                                    color = MeeshyPalette.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 20.sp,
                                )
                            }
                        }
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

private fun imageAspectRatio(image: FeedPostImage): Float {
    val width = image.width ?: return 1.4f
    val height = image.height ?: return 1.4f
    if (width <= 0 || height <= 0) return 1.4f
    return (width.toFloat() / height.toFloat()).coerceIn(0.7f, 1.9f)
}

@Composable
private fun PostStatsRow(post: FeedPostPresentation, onLike: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
        modifier = Modifier.fillMaxWidth(),
    ) {
        val likeLabel = stringResource(if (post.isLiked) R.string.feed_unlike else R.string.feed_like)
        StatAction(
            icon = if (post.isLiked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
            count = post.likeCount,
            contentDescription = likeLabel,
            tint = if (post.isLiked) MeeshyPalette.Error else MeeshyTheme.tokens.textSecondary,
            onClick = onLike,
        )
        StatAction(
            icon = Icons.Outlined.ChatBubbleOutline,
            count = post.commentCount,
            contentDescription = stringResource(R.string.feed_comments),
            tint = MeeshyTheme.tokens.textSecondary,
            onClick = null,
        )
        StatAction(
            icon = Icons.Filled.Repeat,
            count = post.repostCount,
            contentDescription = stringResource(R.string.feed_reposts),
            tint = MeeshyTheme.tokens.textSecondary,
            onClick = null,
        )
    }
}

@Composable
private fun StatAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    count: Int,
    contentDescription: String,
    tint: Color,
    onClick: (() -> Unit)?,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .let { base ->
                if (onClick == null) base
                else base.clickable(onClick = onClick).semantics { role = Role.Button }
            }
            .padding(vertical = MeeshySpacing.xs)
            .semantics { this.contentDescription = contentDescription },
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(18.dp),
        )
        if (count > 0) {
            Text(
                text = count.toString(),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

@Composable
private fun FeedSkeleton() {
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
