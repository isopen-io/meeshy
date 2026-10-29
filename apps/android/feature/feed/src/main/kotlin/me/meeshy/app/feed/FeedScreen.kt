package me.meeshy.app.feed

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
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
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.PostShareLink
import me.meeshy.sdk.model.share.ShareCards
import me.meeshy.sdk.model.share.ShareSubject
import me.meeshy.ui.share.LocalShareLauncher
import me.meeshy.ui.share.open
import me.meeshy.sdk.model.composer.ComposerOrigin
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshySpacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(
    onPostClick: (String) -> Unit = {},
    onOpenPost: (String) -> Unit = {},
    onOpenReels: () -> Unit = {},
    onOpenNearby: () -> Unit = {},
    onOpenProfile: ((String) -> Unit)? = null,
    onOpenHashtag: (String) -> Unit = {},
    onResumeStoryDraft: () -> Unit = {},
    onOpenComposer: ((ComposerOrigin) -> Unit)? = null,
    onRefreshRail: () -> Unit = {},
    storyRail: @Composable () -> Unit = {},
    viewModel: FeedViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    FeedMediaPrefetchEffect(listState = listState, posts = state.posts)
    var composerDraft by remember { mutableStateOf<FeedComposerDraft?>(null) }

    val context = LocalContext.current
    val retryLabel = stringResource(R.string.feed_retry)
    // Each notice shows once, in the reader's language. Collected (not keyed) so consuming
    // it never cancels the toast that is on screen.
    LaunchedEffect(viewModel) {
        viewModel.state.map { it.notice }.distinctUntilChanged().filterNotNull().collect { notice ->
            val unpublished = viewModel.state.value.unpublishedDraft
            viewModel.consumeNotice()
            if (unpublished != null) viewModel.consumeUnpublishedDraft()
            // The author's own post lands at the head: bring it into view (iOS scrolls to it).
            if (notice == FeedNotice.PUBLISHED) launch { listState.animateScrollToItem(0) }
            val result = snackbar.showSnackbar(
                message = context.getString(notice.messageRes()),
                actionLabel = if (unpublished != null) retryLabel else null,
            )
            if (unpublished != null && result == SnackbarResult.ActionPerformed) composerDraft = unpublished
        }
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
            // La porte du composeur (iOS `FeedView.composerPlaceholder`) SOUS le rail de stories, dans le contenu qui
            // défile (#13653) — tapping it opens FeedComposerSheet; the pure FeedComposerDraft owns the publish rules.
            // Then « Reprendre votre brouillon » (#13430) and « Publications non envoyées » (#13417).
            val composerHead: @Composable () -> Unit = {
                FeedComposerHead(
                    onCompose = {
                        if (onOpenComposer != null) onOpenComposer(ComposerOrigin.FeedComposer)
                        else scope.launch { composerDraft = viewModel.restorableDraft() ?: FeedComposerDraft() }
                    },
                    onResumeStory = onResumeStoryDraft,
                    onReopen = { draft -> composerDraft = draft },
                )
            }
            val clipboard = LocalClipboardManager.current
            val linkCopied = stringResource(R.string.feed_link_copied)
            val shareContext = context
            val shareLauncher = LocalShareLauncher.current
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
                onRefresh = {
                    viewModel.refresh()
                    onRefreshRail()
                },
                modifier = Modifier
                    .fillMaxSize()
                    .weight(1f),
            ) {
            when {
                state.showSkeleton -> FeedHeadColumn(storyRail, composerHead) { FeedSkeleton() }
                state.posts.isEmpty() && state.loadFailed -> FeedHeadColumn(storyRail, composerHead) { FeedErrorState(onRetry = viewModel::refresh) }
                state.posts.isEmpty() -> FeedHeadColumn(storyRail, composerHead) { FeedEmptyState() }
                else -> LazyColumn(
                    state = listState,
                    // Aucune marge horizontale de contenu : le rail court d'un bord à l'autre, comme en tête des
                    // conversations ; chaque carte porte sa propre marge.
                    contentPadding = PaddingValues(bottom = MeeshySpacing.lg),
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                ) {
                    // Le rail de stories d'iOS (`StoryTrayView`, `FeedView` : dans le contenu défilant), le MÊME composable que
                    // la liste des conversations (#13653) : il défile avec le fil et porte aussi l'humeur. La tête compte
                    // `FeedListLayout.HEAD_ITEMS` lignes.
                    item(key = FEED_STORY_RAIL_KEY, contentType = FEED_STORY_RAIL_KEY) { storyRail() }
                    item(key = FEED_COMPOSER_HEAD_KEY, contentType = FEED_COMPOSER_HEAD_KEY) { composerHead() }
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
                            onSelectLanguage = { code -> viewModel.onPostLanguageSelected(post.id, code) },
                            translatingCodes = state.translatingCodesOf(post.id),
                            // Only reels open the full-screen reel overlay; regular
                            // posts have no detail screen yet, so tapping is inert.
                            onClick = { if (post.isReel) onPostClick(post.id) else onOpenPost(post.id) },
                            // A tap on the embedded repost opens the ORIGINAL post's detail,
                            // never the outer reposter card.
                            onOpenPost = onOpenPost,
                            onOpenReel = onPostClick,
                            // Tapping an image tile opens the fullscreen media gallery on it.
                            onImageTap = { index -> viewModel.openImageViewer(post.id, index) },
                            isOwn = post.authorId != null && post.authorId == state.currentUserId,
                            onShare = {
                                viewModel.recordShare(post.id)
                                // La feuille de partage unique (#13474) : conversations, copier le lien, partage système.
                                shareLauncher?.open(
                                    ShareSubject.Card(ShareCards.post(post.id, title = post.content, authorId = post.authorId)),
                                ) ?: shareContext.startActivity(
                                    Intent.createChooser(
                                        Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, PostShareLink.webLink(post.id)),
                                        null,
                                    ),
                                )
                            },
                            onCopyLink = {
                                clipboard.setText(AnnotatedString(PostShareLink.webLink(post.id)))
                                scope.launch { snackbar.showSnackbar(linkCopied) }
                            },
                            onCopyText = { clipboard.setText(AnnotatedString(post.content)) },
                            onOpenProfile = onOpenProfile,
                            onOpenHashtag = onOpenHashtag,
                            onRepost = { viewModel.repost(post.id) },
                            onQuote = { viewModel.beginQuote(post.id) },
                            onPin = { viewModel.pinPost(post.id) },
                            onReport = { reportPostId = post.id },
                            onDelete = { deletePostId = post.id },
                            onComments = { onOpenPost(post.id) },
                            modifier = Modifier.animateItem().padding(horizontal = MeeshySpacing.lg),
                        )
                    }
                    if (state.isLoadingMore) {
                        item(key = "feed_load_more") { Box(Modifier.padding(horizontal = MeeshySpacing.lg)) { FeedLoadingMoreCards() } }
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
    state.imageViewer?.let { gallery ->
        FeedImageViewerHost(gallery = gallery, onDismiss = viewModel::dismissImageViewer)
    }

    composerDraft?.let { seed ->
        FeedComposerSheet(
            initialDraft = seed,
            onPublish = { request, draft ->
                viewModel.publishPost(
                    content = request.content,
                    visibility = request.visibility,
                    mediaIds = request.mediaIds,
                    type = request.type,
                    location = request.location,
                    language = request.language,
                    mediaAlt = request.mediaAlt,
                    mediaCaption = request.mediaCaption,
                    background = request.background,
                    draft = draft.toSnapshot(System.currentTimeMillis()),
                )
                composerDraft = null
            },
            onDismiss = { composerDraft = null },
            onDraftChange = viewModel::persistComposerDraft,
            onQueueMedia = viewModel::queueMedia,
            onRemoveMedia = viewModel::discardQueuedMedia,
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

@Composable
private fun FeedComposerHead(onCompose: () -> Unit, onResumeStory: () -> Unit, onReopen: (FeedComposerDraft) -> Unit) {
    Column {
        FeedComposerPlaceholder(onClick = onCompose)
        DraftResumeSection(onResumePost = onCompose, onResumeStory = onResumeStory)
        UnsentPublicationsEntry(onReopen = onReopen, onReopenStory = onResumeStory)
    }
}

/** La tête du fil hors liste peuplée (squelette, erreur, vide) : le rail puis la porte du composeur, au même pas que la liste. */
@Composable
private fun FeedHeadColumn(storyRail: @Composable () -> Unit, composerHead: @Composable () -> Unit, body: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        storyRail()
        composerHead()
        body()
    }
}

private const val FEED_POST_CONTENT_TYPE = "feed_post"
private const val FEED_STORY_RAIL_KEY = "feed_story_rail"
private const val FEED_COMPOSER_HEAD_KEY = "feed_composer_head"
