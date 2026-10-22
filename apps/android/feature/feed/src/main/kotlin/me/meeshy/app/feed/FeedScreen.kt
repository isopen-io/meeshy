package me.meeshy.app.feed

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(
    onPostClick: (String) -> Unit = {},
    onOpenPost: (String) -> Unit = {},
    onOpenReels: () -> Unit = {},
    onOpenNearby: () -> Unit = {},
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
            FeedHeader(
                listState = listState,
                onOpenReels = onOpenReels,
                onOpenNearby = onOpenNearby,
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
                DeletePostDialog(
                    onDismiss = { deletePostId = null },
                    onConfirm = {
                        viewModel.deletePost(targetId)
                        deletePostId = null
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
                    items(state.posts, key = { it.id }, contentType = { FEED_POST_CONTENT_TYPE }) { post ->
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
    state.imageViewer?.let { gallery ->
        FeedImageViewerHost(gallery = gallery, onDismiss = viewModel::dismissImageViewer)
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
                    mediaAlt = request.mediaAlt,
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

private const val FEED_POST_CONTENT_TYPE = "feed_post"
