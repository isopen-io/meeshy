package me.meeshy.app.feed

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.pluralStringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.bubble.LanguageChip
import me.meeshy.ui.component.media.MediaCollage
import me.meeshy.ui.theme.hexColor
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.component.viewer.MeeshyImageViewer
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.format.shortDateTimeLabel
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import java.time.ZoneId
import java.util.Locale
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(
    onPostClick: (String) -> Unit = {},
    onOpenPost: (String) -> Unit = {},
    onOpenSaved: () -> Unit = {},
    viewModel: FeedViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

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
                actions = {
                    IconButton(onClick = onOpenSaved) {
                        Icon(
                            imageVector = Icons.Outlined.BookmarkBorder,
                            contentDescription = stringResource(R.string.bookmarks_title),
                            tint = MeeshyTheme.tokens.textPrimary,
                        )
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
        containerColor = Color.Transparent,
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            // The mood-statuses rail sits pinned above the feed (iOS parity: StatusBarView
            // at the top of FeedView). Its own StatusesViewModel owns the friends feed.
            StatusBarView()
            PullToRefreshBox(
                isRefreshing = state.isSyncing,
                onRefresh = viewModel::refresh,
                modifier = Modifier
                    .fillMaxSize()
                    .weight(1f),
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
                    state = listState,
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
                            onBookmark = { viewModel.toggleBookmark(post.id) },
                            onFlagTap = { code -> viewModel.onPostFlagTap(post.id, code) },
                            // Only reels open the full-screen reel overlay; regular
                            // posts have no detail screen yet, so tapping is inert.
                            onClick = { if (post.isReel) onPostClick(post.id) else onOpenPost(post.id) },
                            // A tap on the embedded repost opens the ORIGINAL post's detail,
                            // never the outer reposter card.
                            onOpenPost = onOpenPost,
                            // Tapping an image tile opens the fullscreen media gallery on it.
                            onImageTap = { index -> viewModel.openImageViewer(post.id, index) },
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

            NewPostsBanner(
                count = state.newPostsCount,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = MeeshySpacing.md),
                onClick = {
                    scope.launch { listState.animateScrollToItem(0) }
                    viewModel.acknowledgeNewPosts()
                },
            )
            }
        }
    }
    }

    val gallery = state.imageViewer
    if (gallery != null) {
        val strings = rememberRelativeTimeStrings()
        val galleryNow = remember(gallery) { System.currentTimeMillis() }
        val galleryTimestamps = remember(gallery, strings) {
            gallery.createdAtIsos.map { iso ->
                iso?.let { isoToEpochMillisOrNull(it) }?.let { millis ->
                    RelativeTimeFormat.short(
                        epochMillis = millis,
                        referenceMillis = galleryNow,
                        zone = ZoneId.systemDefault(),
                        locale = Locale.getDefault(),
                        strings = strings,
                    )
                }
            }
        }
        val galleryContext = LocalContext.current
        val savedMessage = stringResource(R.string.feed_media_saved)
        val saveFailedMessage = stringResource(R.string.feed_media_save_failed)
        MeeshyImageViewer(
            imageUrls = gallery.imageUrls,
            initialIndex = gallery.startIndex,
            onDismiss = viewModel::dismissImageViewer,
            captions = gallery.captions,
            authors = gallery.authorNames,
            timestamps = galleryTimestamps,
            onImageSaved = { result ->
                val message = if (result.isSuccess) savedMessage else saveFailedMessage
                Toast.makeText(galleryContext, message, Toast.LENGTH_SHORT).show()
            },
        )
    }
}

/**
 * The floating "new posts" pill — shown when [count] > 0, tapping it scrolls the feed to
 * the top and acknowledges the banner. Accent-tinted, animated in/out. Port of iOS's
 * new-posts banner over `newPostsCount`.
 */
@Composable
private fun NewPostsBanner(
    count: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = count > 0,
        enter = fadeIn() + slideInVertically { -it },
        exit = fadeOut() + slideOutVertically { -it },
        modifier = modifier,
    ) {
        Surface(
            shape = RoundedCornerShape(MeeshyRadius.pill),
            color = MeeshyPalette.Indigo500,
            shadowElevation = 6.dp,
            modifier = Modifier.clickable(onClick = onClick),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
            ) {
                Icon(
                    imageVector = Icons.Filled.ArrowUpward,
                    contentDescription = null,
                    tint = MeeshyPalette.White,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    text = pluralStringResource(R.plurals.feed_new_posts, count, count),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyPalette.White,
                )
            }
        }
    }
}

/**
 * The feed post timestamp as a compact relative label ("5 min", "2 h", "3 j", …) rather than a
 * raw absolute date — the Prisme-style discreet framing. Falls back to the absolute short label
 * when the instant is absent/unparsable, so a malformed timestamp never blanks or crashes the row.
 */
@Composable
private fun postRelativeTime(iso: String): String {
    val strings = rememberRelativeTimeStrings()
    val epochMillis = isoToEpochMillisOrNull(iso) ?: return shortDateTimeLabel(iso)
    return RelativeTimeFormat.short(
        epochMillis = epochMillis,
        referenceMillis = System.currentTimeMillis(),
        zone = ZoneId.systemDefault(),
        locale = Locale.getDefault(),
        strings = strings,
    )
}

@Composable
private fun PostCard(
    post: FeedPostPresentation,
    onLike: () -> Unit,
    onBookmark: () -> Unit,
    onFlagTap: (String) -> Unit,
    onClick: () -> Unit,
    onOpenPost: (String) -> Unit,
    onImageTap: (Int) -> Unit,
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
                            text = postRelativeTime(it),
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

            if (post.languageStrip.isNotEmpty()) {
                Spacer(Modifier.height(MeeshySpacing.xs))
                PostLanguageStripRow(chips = post.languageStrip, onChipTap = onFlagTap)
            }

            if (post.images.isNotEmpty()) {
                Spacer(Modifier.height(MeeshySpacing.md))
                PostImageGrid(images = post.images, onImageTap = onImageTap)
            }

            post.repostEmbed?.let { embed ->
                Spacer(Modifier.height(MeeshySpacing.md))
                RepostEmbedCell(embed = embed, onOpen = onOpenPost)
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
            PostStatsRow(post = post, onLike = onLike, onBookmark = onBookmark)
        }
    }
}

/**
 * Discrete Prisme flag strip under a translated post — the post's original language
 * plus each configured content language that has content, projected by
 * [me.meeshy.ui.component.bubble.PostLanguageStrip]. A lead-in translate glyph keeps
 * the row legible as a translation indicator; the active language reads its native
 * name in its own accent colour, the others show flag-only. Read-only (feed cards
 * do not switch language inline), mirroring the chat bubble's read-only strip.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PostLanguageStripRow(
    chips: List<LanguageChip>,
    onChipTap: (String) -> Unit,
) {
    FlowRow(
        verticalArrangement = Arrangement.Center,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(
            imageVector = Icons.Filled.Translate,
            contentDescription = stringResource(R.string.feed_translated),
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(14.dp),
        )
        chips.forEach { chip ->
            val info = chip.info
            val accent = info?.colorHex
                ?.let(::hexColor)
                ?.takeIf { it != Color.Unspecified }
                ?: MeeshyTheme.tokens.textSecondary
            val flag = info?.flag ?: chip.code.uppercase()
            val label = info?.name ?: chip.code
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .background(
                        if (chip.isActive) accent.copy(alpha = 0.16f) else Color.Transparent,
                    )
                    .clickable { onChipTap(chip.code) }
                    .padding(horizontal = 6.dp, vertical = 2.dp)
                    .semantics(mergeDescendants = true) { contentDescription = label },
            ) {
                Text(text = flag, style = MaterialTheme.typography.labelSmall)
                if (chip.isActive && info != null) {
                    Text(
                        text = info.nativeName,
                        style = MaterialTheme.typography.labelSmall,
                        color = accent,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(start = 3.dp),
                    )
                }
            }
        }
    }
}

private val COLLAGE_HEIGHT = 260.dp

@Composable
private fun PostImageGrid(images: List<FeedPostImage>, onImageTap: (Int) -> Unit) {
    val shape = RoundedCornerShape(MeeshyRadius.md)
    val openLabel = stringResource(R.string.feed_open_media)
    val layout = MediaCollage.solve(images.size)
    if (layout.isEmpty) return
    if (layout.isSingle) {
        val image = images.first()
        AsyncImage(
            model = image.url,
            contentDescription = stringResource(R.string.feed_image_description),
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(imageAspectRatio(image))
                .clip(shape)
                .background(MeeshyPalette.Indigo500.copy(alpha = 0.08f))
                .clickable(onClickLabel = openLabel) { onImageTap(0) },
        )
        return
    }
    Column(
        modifier = Modifier.height(COLLAGE_HEIGHT),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        layout.rows.forEach { row ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(row.heightWeight),
            ) {
                row.cells.forEach { cell ->
                    CollageTile(
                        image = images[cell.index],
                        overflowCount = cell.overflowCount,
                        shape = shape,
                        onClick = { onImageTap(cell.index) },
                        onClickLabel = openLabel,
                        modifier = Modifier
                            .weight(cell.widthWeight)
                            .fillMaxHeight(),
                    )
                }
            }
        }
    }
}

@Composable
private fun CollageTile(
    image: FeedPostImage,
    overflowCount: Int,
    shape: Shape,
    onClick: () -> Unit,
    onClickLabel: String,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(shape)
            .background(MeeshyPalette.Indigo500.copy(alpha = 0.08f))
            .clickable(onClickLabel = onClickLabel, onClick = onClick),
    ) {
        AsyncImage(
            model = image.thumbnailUrl ?: image.url,
            contentDescription = stringResource(R.string.feed_image_description),
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
        if (overflowCount > 0) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.45f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(R.string.feed_hidden_images, overflowCount),
                    color = MeeshyPalette.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 20.sp,
                )
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
private fun PostStatsRow(post: FeedPostPresentation, onLike: () -> Unit, onBookmark: () -> Unit) {
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
        Spacer(Modifier.weight(1f))
        val bookmarkLabel =
            stringResource(if (post.isBookmarked) R.string.feed_unbookmark else R.string.feed_bookmark)
        StatAction(
            icon = if (post.isBookmarked) Icons.Filled.Bookmark else Icons.Outlined.BookmarkBorder,
            count = post.bookmarkCount,
            contentDescription = bookmarkLabel,
            tint = if (post.isBookmarked) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textSecondary,
            onClick = onBookmark,
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
