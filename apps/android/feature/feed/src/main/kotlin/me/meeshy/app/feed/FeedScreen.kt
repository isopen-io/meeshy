package me.meeshy.app.feed

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.TextButton
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
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
import me.meeshy.ui.component.media.rememberThumbHashPainter
import me.meeshy.ui.theme.hexColor
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.sdk.model.report.ReportReason
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
    var composerDraft by remember { mutableStateOf<FeedComposerDraft?>(null) }

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
            // at the top of FeedView), with a Friends/Discover feed toggle above it. Its own
            // StatusesViewModel drives both feeds (one VM vs iOS's two instances).
            StatusBarView()
            // Composer placeholder (iOS parity: FeedView.composerPlaceholder, positioned
            // above the post list). Text-only first sub-slice (feature-parity §F) — tapping
            // it opens FeedComposerSheet; the pure FeedComposerDraft owns the publish rules.
            FeedComposerPlaceholder(onClick = { composerDraft = FeedComposerDraft() })
            val clipboard = LocalClipboardManager.current
            val shareContext = LocalContext.current
            var reportPostId by remember { mutableStateOf<String?>(null) }
            var deletePostId by remember { mutableStateOf<String?>(null) }
            reportPostId?.let { targetId ->
                ReportPostDialog(
                    onDismiss = { reportPostId = null },
                    onReport = { reason ->
                        viewModel.reportPost(targetId, reason)
                        reportPostId = null
                    },
                )
            }
            deletePostId?.let { targetId ->
                AlertDialog(
                    onDismissRequest = { deletePostId = null },
                    title = { Text(stringResource(R.string.feed_delete_confirm_title)) },
                    text = { Text(stringResource(R.string.feed_delete_confirm_message)) },
                    confirmButton = {
                        TextButton(onClick = {
                            viewModel.deletePost(targetId)
                            deletePostId = null
                        }) { Text(stringResource(R.string.feed_delete_confirm), color = MeeshyPalette.Error) }
                    },
                    dismissButton = {
                        TextButton(onClick = { deletePostId = null }) {
                            Text(stringResource(R.string.feed_delete_cancel))
                        }
                    },
                )
            }
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
                        LaunchedEffect(post.id) {
                            viewModel.trackImpression(post.id)
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
                            isOwn = post.authorId != null && post.authorId == state.currentUserId,
                            onShare = {
                                viewModel.recordShare(post.id)
                                val send = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_TEXT, postShareUrl(post.id))
                                }
                                shareContext.startActivity(Intent.createChooser(send, null))
                            },
                            onCopyLink = { clipboard.setText(AnnotatedString(postShareUrl(post.id))) },
                            onRepost = { viewModel.repost(post.id) },
                            onQuote = { viewModel.beginQuote(post.id) },
                            onPin = { viewModel.pinPost(post.id) },
                            onReport = { reportPostId = post.id },
                            onDelete = { deletePostId = post.id },
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
            thumbnailUrls = gallery.thumbnailUrls,
            onImageSaved = { result ->
                val message = if (result.isSuccess) savedMessage else saveFailedMessage
                Toast.makeText(galleryContext, message, Toast.LENGTH_SHORT).show()
            },
        )
    }

    composerDraft?.let { seed ->
        FeedComposerSheet(
            initialDraft = seed,
            onPublish = { request ->
                viewModel.publishPost(
                    content = request.content,
                    visibility = request.visibility,
                    mediaIds = request.mediaIds,
                    type = request.type,
                    location = request.location,
                    language = request.language,
                )
                composerDraft = null
            },
            onDismiss = { composerDraft = null },
            onUploadMedia = viewModel::uploadMedia,
            onMediaError = { message -> scope.launch { snackbar.showSnackbar(message) } },
        )
    }

    state.quoteComposer?.let { composer ->
        QuoteComposerSheet(
            composer = composer,
            onTextChange = viewModel::onQuoteTextChange,
            onSubmit = viewModel::submitQuote,
            onDismiss = viewModel::cancelQuote,
        )
    }
}

/**
 * Le compositeur de citation : reposter un post accompagne d'un commentaire. Rendu
 * bete de [QuoteComposerState] — la card source (auteur + apercu) au-dessus d'un champ
 * de commentaire libre. Parite iOS (feuille de composition avec `quotePost`), en dialog
 * pour rester coherent avec [ReportPostDialog].
 */
@Composable
internal fun QuoteComposerSheet(
    composer: QuoteComposerState,
    onTextChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    val unknownAuthor = stringResource(R.string.feed_unknown_author)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.feed_quote_title)) },
        text = {
            Column {
                OutlinedTextField(
                    value = composer.text,
                    onValueChange = onTextChange,
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text(stringResource(R.string.feed_quote_hint)) },
                )
                Spacer(Modifier.height(MeeshySpacing.md))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(MeeshyRadius.md))
                        .border(
                            1.dp,
                            MeeshyTheme.tokens.inputBorder,
                            RoundedCornerShape(MeeshyRadius.md),
                        )
                        .padding(MeeshySpacing.md),
                ) {
                    Text(
                        text = composer.sourceAuthorName ?: unknownAuthor,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MeeshyTheme.tokens.textPrimary,
                    )
                    if (composer.sourceContentPreview.isNotBlank()) {
                        Text(
                            text = composer.sourceContentPreview,
                            style = MaterialTheme.typography.bodySmall,
                            color = MeeshyTheme.tokens.textSecondary,
                            maxLines = 3,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onSubmit) {
                Text(stringResource(R.string.feed_quote_submit))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.feed_quote_cancel))
            }
        },
    )
}

/**
 * The tappable "share something with the world" row above the post list — iOS parity:
 * `FeedView.composerPlaceholder`. Deliberately simpler than iOS's version (no live
 * avatar or "+" attachment menu — this first sub-slice is text-only, see
 * [FeedComposerSheet]'s own doc comment for the deferred follow-ups) — a rounded
 * input-styled row that opens the composer sheet on tap.
 */
@Composable
private fun FeedComposerPlaceholder(onClick: () -> Unit) {
    val a11yLabel = stringResource(R.string.feed_composer_open_label)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg)
            .padding(bottom = MeeshySpacing.sm)
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(MeeshyTheme.tokens.inputBackground)
            .border(1.dp, MeeshyTheme.tokens.inputBorder, RoundedCornerShape(MeeshyRadius.lg))
            .clickable(onClick = onClick)
            .semantics {
                contentDescription = a11yLabel
                role = Role.Button
            }
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(R.string.feed_composer_open_placeholder),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textMuted,
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

/**
 * Open a shared place on the device map. Prefers a `geo:` intent (any installed map
 * app), falling back to a Google Maps web URL when no map app is installed — so the
 * sticker never dead-ends. Coordinates are formatted with [Locale.ROOT] so a
 * comma-decimal JVM locale never emits an invalid `geo:` value.
 *
 * `internal` so the shared [RepostEmbedCell] can reuse the same intent orchestration
 * for a reposted post's location sticker — one map-open path, not a copy per screen.
 */
internal fun openPlaceOnMap(context: Context, location: FeedLocationPresentation) {
    val coords = String.format(Locale.ROOT, "%f,%f", location.latitude, location.longitude)
    val query = location.label?.let { Uri.encode(it) }
    val geoUri = if (query != null) "geo:$coords?q=$coords($query)" else "geo:$coords?q=$coords"
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(geoUri)))
    } catch (_: ActivityNotFoundException) {
        val webUri = Uri.parse("https://www.google.com/maps/search/?api=1&query=$coords")
        context.startActivity(Intent(Intent.ACTION_VIEW, webUri))
    }
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
    isOwn: Boolean = false,
    onShare: () -> Unit = {},
    onCopyLink: () -> Unit = {},
    onRepost: () -> Unit = {},
    onQuote: () -> Unit = {},
    onPin: () -> Unit = {},
    onReport: () -> Unit = {},
    onDelete: () -> Unit = {},
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
                PostOptionsButton(
                    isOwn = isOwn,
                    isBookmarked = post.isBookmarked,
                    onShare = onShare,
                    onCopyLink = onCopyLink,
                    onRepost = onRepost,
                    onQuote = onQuote,
                    onBookmarkToggle = onBookmark,
                    onPin = onPin,
                    onReport = onReport,
                    onDelete = onDelete,
                )
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

            post.location?.let { loc ->
                Spacer(Modifier.height(MeeshySpacing.md))
                val mapContext = LocalContext.current
                FeedPostLocationSticker(
                    location = loc,
                    onTap = { openPlaceOnMap(mapContext, loc) },
                )
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
            placeholder = rememberThumbHashPainter(image.thumbHash),
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
            placeholder = rememberThumbHashPainter(image.thumbHash),
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


/** L'URL publique d'un post — meme format que le deep link iOS `meeshy.me/post/{id}`. */
internal fun postShareUrl(postId: String): String = "https://meeshy.me/post/$postId"

/**
 * L'overflow en haut a droite de chaque card — rendu bete de [PostActionMenu],
 * qui decide seul de la liste et de l'ordre (verrouille par test).
 */
@Composable
private fun PostOptionsButton(
    isOwn: Boolean,
    isBookmarked: Boolean,
    onShare: () -> Unit,
    onCopyLink: () -> Unit,
    onRepost: () -> Unit,
    onQuote: () -> Unit,
    onBookmarkToggle: () -> Unit,
    onPin: () -> Unit,
    onReport: () -> Unit,
    onDelete: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { expanded = true }) {
            Icon(
                imageVector = Icons.Filled.MoreVert,
                contentDescription = stringResource(R.string.feed_post_options),
                tint = MeeshyTheme.tokens.textSecondary,
            )
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            PostActionMenu.actions(PostActionContext(isOwn = isOwn, isBookmarked = isBookmarked)).forEach { action ->
                val (label, handler) = when (action) {
                    PostAction.Share -> stringResource(R.string.feed_action_share) to onShare
                    PostAction.CopyLink -> stringResource(R.string.feed_action_copy_link) to onCopyLink
                    PostAction.Repost -> stringResource(R.string.feed_action_repost) to onRepost
                    PostAction.Quote -> stringResource(R.string.feed_action_quote) to onQuote
                    PostAction.Bookmark -> stringResource(R.string.feed_action_bookmark) to onBookmarkToggle
                    PostAction.Unbookmark -> stringResource(R.string.feed_action_unbookmark) to onBookmarkToggle
                    PostAction.Pin -> stringResource(R.string.feed_action_pin) to onPin
                    PostAction.Report -> stringResource(R.string.feed_action_report) to onReport
                    PostAction.Delete -> stringResource(R.string.feed_action_delete) to onDelete
                }
                DropdownMenuItem(
                    text = {
                        Text(
                            text = label,
                            color = if (action == PostAction.Delete) MeeshyPalette.Error else MeeshyTheme.tokens.textPrimary,
                        )
                    },
                    onClick = {
                        expanded = false
                        handler()
                    },
                )
            }
        }
    }
}

/** Choix de la raison de signalement — memes raisons wire que le report utilisateur. */
@Composable
private fun ReportPostDialog(
    onDismiss: () -> Unit,
    onReport: (ReportReason) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.feed_report_title)) },
        text = {
            Column {
                ReportReason.entries.forEach { reason ->
                    val label = when (reason) {
                        ReportReason.SPAM -> stringResource(R.string.feed_report_reason_spam)
                        ReportReason.HARASSMENT -> stringResource(R.string.feed_report_reason_harassment)
                        ReportReason.INAPPROPRIATE -> stringResource(R.string.feed_report_reason_inappropriate)
                        ReportReason.VIOLENCE -> stringResource(R.string.feed_report_reason_violence)
                        ReportReason.HATE_SPEECH -> stringResource(R.string.feed_report_reason_hate_speech)
                        ReportReason.IMPERSONATION -> stringResource(R.string.feed_report_reason_impersonation)
                        ReportReason.OTHER -> stringResource(R.string.feed_report_reason_other)
                    }
                    Text(
                        text = label,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MeeshyTheme.tokens.textPrimary,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onReport(reason) }
                            .padding(vertical = MeeshySpacing.md),
                    )
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.feed_delete_cancel)) }
        },
    )
}
