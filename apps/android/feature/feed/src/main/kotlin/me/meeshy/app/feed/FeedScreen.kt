package me.meeshy.app.feed

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
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.PostShareLink
import me.meeshy.sdk.model.share.ShareCard
import me.meeshy.sdk.model.share.ShareCards
import me.meeshy.sdk.model.share.ShareSubject
import me.meeshy.ui.share.LocalShareLauncher
import me.meeshy.ui.share.open
import me.meeshy.sdk.model.composer.ComposerOrigin
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshySpacing
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.feed.FeedOverlayAppearance

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
    /** Every door of the composer (#13863): the placeholder, a draft to resume, a failed post reopened — one host, one scene. */
    onOpenComposer: (ComposerOrigin) -> Unit,
    onRefreshRail: () -> Unit = {},
    storyRail: @Composable () -> Unit = {},
    pinnedBand: (@Composable (reveal: Float) -> Unit)? = null,
    viewModel: FeedViewModel = hiltViewModel(),
    autoplayHost: FeedAutoplayViewModel = hiltViewModel(),
    unsent: UnsentPublicationsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val pendingCards by unsent.cards.collectAsStateWithLifecycle()
    val pending = pendingCards.orEmpty()
    val snackbar = remember { SnackbarHostState() }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    var commentsPostId by remember { mutableStateOf<String?>(null) }
    var commentsReplyTo by remember { mutableStateOf<String?>(null) }
    FeedMediaPrefetchEffect(listState = listState, posts = state.posts)
    // Loin du haut ou hors de l'écran, ce qui arrive en tête attend la bannière : le post lu ne bouge pas (#16676).
    FeedHeadHoldEffect(listState = listState, headItems = FeedListLayout.HEAD_ITEMS + pending.size, onHolding = viewModel::holdHead)
    // Une seule scène joue dans le fil, la plus visible ; les autres sont une image fixe sans lecteur (#13663).
    val sceneCoordinator = remember { FeedSceneCoordinator() }
    val sceneIds = remember(state.posts) { feedSceneIds(state.posts) }
    val autoplay = rememberFeedAutoplay(autoplayHost, sceneCoordinator, listState, sceneIds)
    val impressionTracker = remember(viewModel) {
        FeedImpressionTracker(record = { id, _ -> viewModel.trackImpression(id) }, flush = viewModel::flushImpressions)
    }
    // Sortie ou arrière-plan : le lot d'impressions part, il n'est pas jeté (iOS `onDisappear` → `flushNow`).
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, impressionTracker) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) impressionTracker.exited() }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            impressionTracker.exited()
        }
    }
    val context = LocalContext.current
    val haptics = me.meeshy.ui.haptics.rememberMeeshyHaptics()
    // Each notice shows once, in the reader's language. Collected (not keyed) so consuming
    // it never cancels the toast that is on screen.
    LaunchedEffect(viewModel) {
        viewModel.state.map { it.notice }.distinctUntilChanged().filterNotNull().collect { notice ->
            viewModel.consumeNotice()
            // The author's own post lands at the head: bring it into view (iOS scrolls to it).
            if (notice == FeedNotice.PUBLISHED) launch { listState.animateScrollToItem(0) }
            haptics.forNotice(notice)
            snackbar.showSnackbar(message = context.getString(notice.messageRes(unsent.offline.value)))
        }
    }

    LaunchedEffect(unsent) { unsent.reopened.collect { onOpenComposer(ComposerOrigin.FeedComposer) } }
    PendingFeedbackEffect(unsent, snackbar)
    val pendingActions: (PendingFeedCard) -> PendingSendActions = { card ->
        PendingSendActions(
            canRetry = card.canRetry,
            canReopen = card.canReopen,
            onRetry = { unsent.retry(card.post.id) },
            onReopen = { unsent.reopen(card.post.id) },
            onCancel = { unsent.cancelSend(card.post.id) },
        )
    }

    MeeshyBackground(ambient = { dark -> FeedAmbientHalos(isDark = dark) }) {
    CompositionLocalProvider(LocalFeedSceneCoordinator provides sceneCoordinator, LocalFeedAutoplayCoordinator provides autoplay) {
    Scaffold(
        topBar = {
            FeedHeader(
                listState = listState,
                onOpenReels = onOpenReels,
                onOpenNearby = onOpenNearby,
                pinnedBand = pinnedBand,
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
            // défile (#13653) — it opens the ONE composer on its scene (#13863). Then « Reprendre votre brouillon » (#13430)
            // — a publication still on the device reads as a card of the list, its time replaced by the clock (#14902).
            val composerHead: @Composable () -> Unit = {
                FeedComposerHead(
                    userName = state.currentUserName,
                    avatarUrl = state.currentUserAvatarUrl,
                    onCompose = { unsent.openComposerRecovering { onOpenComposer(ComposerOrigin.FeedComposer) } },
                    onResumeStory = onResumeStoryDraft,
                )
            }
            val clipboard = LocalClipboardManager.current
            val linkCopied = stringResource(R.string.feed_link_copied)
            val shareLauncher = LocalShareLauncher.current
            val shareOut = rememberContentShareOut()
            val copyPostLink = rememberPostLinkCopy()
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
            FeedOfflineBand(visible = state.showsOfflineBand(hasPending = pending.isNotEmpty()))
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
            when (state.body(hasPending = pending.isNotEmpty())) {
                FeedBody.SKELETON -> FeedHeadColumn(storyRail, composerHead) { FeedSkeleton() }
                FeedBody.OFFLINE_EMPTY -> FeedHeadColumn(storyRail, composerHead) { FeedOfflineEmptyState(onRetry = viewModel::refresh) }
                FeedBody.LOAD_ERROR -> FeedHeadColumn(storyRail, composerHead) { FeedErrorCard(onRetry = viewModel::refresh) }
                FeedBody.EMPTY -> FeedHeadColumn(storyRail, composerHead) { FeedEmptyState() }
                FeedBody.POSTS -> LazyColumn(
                    state = listState,
                    modifier = Modifier.sceneViewport(),
                    // Aucune marge horizontale de contenu : le rail court d'un bord à l'autre, comme en tête des
                    // conversations ; chaque carte porte sa propre marge.
                    contentPadding = PaddingValues(bottom = FeedOverlayAppearance.BOTTOM_CLEARANCE_DP.dp),
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                ) {
                    // Le rail de stories d'iOS (`StoryTrayView`, `FeedView` : dans le contenu défilant), le MÊME composable que
                    // la liste des conversations (#13653) : il défile avec le fil et porte aussi l'humeur. La tête compte
                    // `FeedListLayout.HEAD_ITEMS` lignes.
                    item(key = FEED_STORY_RAIL_KEY, contentType = FEED_STORY_RAIL_KEY) { storyRail() }
                    item(key = FEED_COMPOSER_HEAD_KEY, contentType = FEED_COMPOSER_HEAD_KEY) { composerHead() }
                    items(pending, key = { it.post.id }, contentType = { FEED_POST_CONTENT_TYPE }) { card ->
                        PostCard(
                            post = card.post,
                            onLike = {},
                            onBookmark = {},
                            onFlagTap = {},
                            onClick = { onOpenPost(card.post.id) },
                            onOpenPost = {},
                            onImageTap = {},
                            isOwn = true,
                            onCopyText = { clipboard.setText(AnnotatedString(card.post.content)) },
                            pendingSend = pendingActions(card),
                            modifier = Modifier.animateItem().padding(horizontal = MeeshySpacing.lg),
                        )
                    }
                    items(state.posts, key = FeedPostPresentation::listKey, contentType = { FEED_POST_CONTENT_TYPE }) { post ->
                        LaunchedEffect(post.id, state.posts.size) {
                            viewModel.loadMoreIfNeeded(post.id)
                        }
                        LaunchedEffect(post.id) {
                            impressionTracker.appeared(post)
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
                            // « Envoyer » (#14315) : la feuille Meeshy, qui frappe le lien de l'utilisateur ; « Partager »
                            // (menu « ⋯ ») : la feuille du système, avec ce même lien.
                            onSend = {
                                val card = post.shareCard(context)
                                shareLauncher?.open(ShareSubject.Card(card)) ?: shareOut(card)
                            },
                            onShare = { shareOut(post.shareCard(context)) },
                            onCopyLink = {
                                copyPostLink(post.id) { url ->
                                    clipboard.setText(AnnotatedString(url))
                                    scope.launch { snackbar.showSnackbar(linkCopied) }
                                }
                            },
                            onCopyText = { clipboard.setText(AnnotatedString(post.content)) },
                            onOpenProfile = onOpenProfile,
                            onOpenHashtag = onOpenHashtag,
                            onRepost = { viewModel.repost(post.id) },
                            onQuote = { viewModel.beginQuote(post.id) },
                            onPin = { viewModel.pinPost(post.id) },
                            onToggleComments = { viewModel.toggleComments(post.id) },
                            onReport = { reportPostId = post.id },
                            onDelete = { deletePostId = post.id },
                            onComments = { commentsPostId = post.id; commentsReplyTo = null },
                            onReplyToComment = { commentId -> commentsPostId = post.id; commentsReplyTo = commentId },
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
    }
    FeedCommentsSheetHost(
        postId = commentsPostId,
        serverCount = state.posts.firstOrNull { it.id == commentsPostId }?.commentCount ?: 0,
        replyToCommentId = commentsReplyTo,
        onDismiss = { commentsPostId = null; commentsReplyTo = null },
        onCommentSent = viewModel::onCommentSent,
        commentsClosed = state.posts.firstOrNull { it.id == commentsPostId }?.commentsClosed,
    )
    state.imageViewer?.let { gallery ->
        FeedImageViewerHost(gallery = gallery, onDismiss = viewModel::dismissImageViewer)
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
private fun FeedComposerHead(userName: String?, avatarUrl: String?, onCompose: () -> Unit, onResumeStory: () -> Unit) {
    Column {
        // Le sélecteur initial propre à chaque entrée du « + » attend la couture du composeur : toutes ouvrent la même scène.
        FeedComposerPlaceholder(onClick = onCompose, userName = userName, avatarUrl = avatarUrl, onEntry = { onCompose() })
        DraftResumeSection(onResumePost = onCompose, onResumeStory = onResumeStory)
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

/** La carte d'un post pour ses deux gestes de partage : « 🔗 Publication de X : lien », la forme de la story. */
internal fun FeedPostPresentation.shareCard(context: android.content.Context): ShareCard {
    val link = PostShareLink.webLink(id)
    val sentence = authorName?.takeIf { it.isNotBlank() }?.let { context.getString(R.string.share_post_text, it, link) } ?: link
    return ShareCards.post(id, title = content, authorId = authorId, messageText = sentence)
}
