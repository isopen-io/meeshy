package me.meeshy.app.feed

import androidx.compose.foundation.background
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.PostReactionPaletteState
import me.meeshy.sdk.model.PostReactionPick
import me.meeshy.ui.component.reaction.PostReactionPalette
import me.meeshy.ui.component.reaction.PostReactionPaletteAnchor
import me.meeshy.ui.modifier.reactionPaletteTrigger
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.bubble.RichMessageText
import me.meeshy.ui.component.rememberPresence
import me.meeshy.sdk.model.PostAbsenceReason
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.bubble.LanguageChip
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.leadingNavigationIcon
import me.meeshy.ui.component.chrome.leadingNavigationLabel
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.format.shortDateTimeLabel
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.component.bubble.RichMessageText
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor
import java.time.ZoneId
import java.util.Locale

/**
 * A single feed post opened full-screen — reached by tapping a non-reel post in the feed
 * (reels still route to the reels player). Renders the post the feed card projects, plus a
 * working Prisme language switch (the flag strip), and read-only engagement counts. A cold
 * open shows a skeleton until the fetch answers; a missing post shows a coherent not-found
 * state; back returns to the feed. Comments live in a later slice.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PostDetailScreen(
    onBack: () -> Unit = {},
    onOpenPost: (String) -> Unit = {},
    onOpenReel: (String) -> Unit = onOpenPost,
    onOpenProfile: ((String) -> Unit)? = null,
    onOpenHashtag: (String) -> Unit = {},
    viewersSheet: @Composable (postId: String, onDismiss: () -> Unit) -> Unit = { _, _ -> },
    viewModel: PostDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // #16541 — le fil du détail (le même magasin que sa section et son composeur) suit la fermeture que le post sert.
    CommentsClosedEffect(hiltViewModel<PostCommentsViewModel>(), state.post?.commentsClosed)
    var viewersOpen by remember { mutableStateOf(false) }
    var authorChipShown by remember(viewModel) { mutableStateOf(false) }
    if (viewersOpen) state.post?.id?.let { id -> viewersSheet(id) { viewersOpen = false } }
    val quickEmojis by viewModel.quickEmojis.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val linkCopied = stringResource(R.string.feed_link_copied)

    // Le post supprime : l'ecran se ferme.
    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect -> if (effect == PostDetailEffect.Close) onBack() }
    }

    // Collected (not keyed) so consuming the notice never cancels the toast on screen, as in the feed.
    LaunchedEffect(viewModel) {
        viewModel.state.map { it.notice }.distinctUntilChanged().filterNotNull().collect { notice ->
            viewModel.consumeNotice()
            snackbar.showSnackbar(context.getString(notice.messageRes()))
        }
    }

    LaunchedEffect(state.errorMessage) {
        // Sans post, l'echec a son propre ecran (PostDetailAbsenceView) : pas de snackbar doublon.
        if (state.post != null) state.errorMessage?.let { snackbar.showSnackbar(it) }
    }

    // Leaving the detail closes the dwell session, recording the measured watch-time against
    // the view this screen already opened (only when it passed the dwell floor). Mirrors
    // ReelsScreen's `onDispose { setCurrentReel(null) }`.
    DisposableEffect(Unit) {
        onDispose { viewModel.endDwellSession() }
    }

    MeeshyBackground {
        Scaffold(
            topBar = {
                CenterAlignedTopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                    ),
                    title = {
                        val shownPost = state.post
                        if (authorChipShown && shownPost != null) {
                            PostDetailAuthorChip(post = shownPost, onOpenProfile = onOpenProfile)
                        } else {
                            Text(stringResource(R.string.post_detail_title), fontWeight = FontWeight.Bold)
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                imageVector = leadingNavigationIcon(),
                                contentDescription = leadingNavigationLabel(stringResource(R.string.post_detail_back)),
                                tint = MeeshyTheme.tokens.textPrimary,
                            )
                        }
                    },
                    actions = {
                        state.post?.let { shown ->
                            PostDetailMenu(shown, rememberPostDetailMenuActions(shown, viewModel) {
                                scope.launch { snackbar.showSnackbar(linkCopied) }
                            })
                        }
                    },
                )
            },
            containerColor = Color.Transparent,
            // #14313 — le bas appartient au composeur épinglé : il porte lui-même la barre de navigation et le clavier
            // (`ComposerShellLayout`). Laissé à l'échafaudage, l'encart bas était compté deux fois (~140 px de vide).
            contentWindowInsets = WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal),
        ) { padding ->
            PullToRefreshBox(
                isRefreshing = state.isRefreshing,
                onRefresh = viewModel::refresh,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .consumeWindowInsets(padding),
            ) {
                when {
                    state.showSkeleton -> PostDetailSkeleton()
                    state.post == null -> PostDetailAbsenceView(
                        reason = PostAbsenceReason.resolve(
                            hasPost = false,
                            isLoading = state.isLoading,
                            failure = state.loadFailure,
                        ),
                        failure = state.loadFailure,
                        onRetry = viewModel::retryLoad,
                        onBack = onBack,
                    )
                    else -> PostDetailContent(
                        post = state.post!!,
                        isReposted = state.isReposted,
                        secondaryTranslation = state.secondaryTranslation,
                        detailLanguageStrip = state.detailLanguageStrip,
                        translatingCodes = state.translatingLanguages,
                        onFlagTap = viewModel::onFlagTap,
                        onSelectLanguage = viewModel::onLanguageSelected,
                        onOpenPost = onOpenPost,
                        onOpenReel = onOpenReel,
                        onOpenProfile = onOpenProfile,
                        onOpenHashtag = onOpenHashtag,
                        onOpenViewers = if (state.canListViewers) ({ viewersOpen = true }) else null,
                        onAuthorChipReveal = { authorChipShown = it },
                        onRepost = viewModel::repost,
                        onQuote = viewModel::beginQuote,
                        onLike = viewModel::toggleLike,
                        quickEmojis = quickEmojis,
                        onReact = viewModel::react,
                        onBookmark = viewModel::toggleBookmark,
                        onCommentNotice = { notice -> snackbar.showSnackbar(context.getString(notice.messageRes)) },
                        snackbarHost = { SnackbarHost(snackbar) },
                    )
                }
            }
        }
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
internal fun PostDetailContent(
    post: FeedPostPresentation,
    isReposted: Boolean,
    secondaryTranslation: PostSecondaryTranslation?,
    detailLanguageStrip: List<LanguageChip>,
    translatingCodes: Set<String>,
    onFlagTap: (String) -> Unit,
    onSelectLanguage: (String) -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenReel: (String) -> Unit,
    onOpenProfile: ((String) -> Unit)?,
    onOpenHashtag: (String) -> Unit,
    onOpenViewers: (() -> Unit)?,
    onRepost: () -> Unit,
    onQuote: () -> Unit,
    onLike: () -> Unit,
    quickEmojis: List<String>,
    onReact: (PostReactionPick) -> Unit,
    onBookmark: () -> Unit,
    onCommentNotice: suspend (CommentNotice) -> Unit,
    commentsSection: @Composable () -> Unit = { PostCommentsSection(onNotice = onCommentNotice, support = post.commentCardSupport) },
    commentComposer: @Composable () -> Unit = { PostCommentsComposerBar() },
    snackbarHost: @Composable () -> Unit = {},
    onAuthorChipReveal: (Boolean) -> Unit = {},
) {
    var viewportTop by remember { mutableFloatStateOf(0f) }
    var viewportBottom by remember { mutableFloatStateOf(0f) }
    val pageScroll = rememberScrollState()
    val keyboardInsets = WindowInsets.ime
    val pageDensity = androidx.compose.ui.platform.LocalDensity.current
    val sceneViewport: () -> PostDetailViewport = {
        PostDetailViewport(viewportTop, viewportBottom, pageScroll.value.toFloat(), keyboardInsets.getBottom(pageDensity) > 0)
    }
    val revealChip by rememberUpdatedState(onAuthorChipReveal)
    val unknownAuthor = stringResource(R.string.feed_unknown_author)
    var gallery by remember(post.id) { mutableStateOf<FeedGallery?>(null) }
    var explorerOpen by rememberSaveable(post.id) { mutableStateOf(false) }
    post.languageExplorer?.takeIf { explorerOpen }?.let { explorer ->
        PostTranslationSheet(
            explorer = explorer,
            translating = translatingCodes,
            onSelectLanguage = onSelectLanguage,
            onDismiss = { explorerOpen = false },
        )
    }
    gallery?.let { opened -> FeedImageViewerHost(gallery = opened, onDismiss = { gallery = null }) }
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f).fillMaxWidth().onGloballyPositioned {
            viewportTop = it.positionInRoot().y
            viewportBottom = viewportTop + it.size.height
        }) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(pageScroll)
                    .padding(MeeshySpacing.lg),
            ) {
                MeeshyGlassSurface(
                    shape = RoundedCornerShape(MeeshyRadius.xl),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.padding(MeeshySpacing.lg)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.onGloballyPositioned { block ->
                                revealChip(PostDetailHeaderReveal.revealed(block.positionInRoot().y + block.size.height, viewportTop))
                            },
                        ) {
                            val profileTap = Modifier.opensAuthorProfile(post.authorProfile())
                            MeeshyAvatar(
                                name = post.authorName ?: unknownAuthor,
                                size = 44.dp,
                                imageUrl = post.authorAvatarUrl,
                                presence = rememberPresence(post.authorId),
                                modifier = profileTap,
                            )
                            Spacer(Modifier.width(MeeshySpacing.md))
                            Column(Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = post.authorName ?: unknownAuthor,
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.SemiBold,
                                        color = MeeshyTheme.tokens.textPrimary,
                                        modifier = profileTap,
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
                                        text = detailRelativeTime(it),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MeeshyTheme.tokens.textSecondary,
                                    )
                                }
                                PostReachLine(post = post)
                                onOpenViewers?.let { open -> ViewersEntry(onClick = open) }
                            }
                        }

                        if (post.content.isNotBlank() && !post.showsReelCard) {
                            Spacer(Modifier.height(MeeshySpacing.md))
                            HashtagAwareLinks(onOpenHashtag) {
                                SelectionContainer {
                                    RichMessageText(
                                        text = post.content,
                                        style = MaterialTheme.typography.bodyLarge,
                                        color = MeeshyTheme.tokens.textPrimary,
                                    )
                                }
                            }
                        }

                        PostSecondaryTranslationPanel(secondaryTranslation)

                        if (detailLanguageStrip.isNotEmpty() || post.languageExplorer != null) {
                            Spacer(Modifier.height(MeeshySpacing.sm))
                            DetailLanguageStrip(
                                chips = detailLanguageStrip,
                                onChipTap = onFlagTap,
                                onOpenExplorer = post.languageExplorer?.let { { explorerOpen = true } },
                            )
                        }

                        val scenes = post.scenes
                        if (scenes != null) {
                            Spacer(Modifier.height(MeeshySpacing.md))
                            PostDetailSceneSection(scenes = scenes, viewport = sceneViewport, imager = rememberPostImager(post))
                        } else if (post.media.isNotEmpty() && !post.isReel) {
                            Spacer(Modifier.height(MeeshySpacing.md))
                            PostDetailMedia(
                                media = post.media,
                                owner = DetailMediaAuthor.of(post),
                                accentHex = post.accentHex,
                                onOpenVisual = { index ->
                                    gallery = FeedMediaGallery.ofVisuals(post, index).takeUnless(FeedGallery::isEmpty)
                                },
                            )
                        } else if (post.images.isNotEmpty()) {
                            Spacer(Modifier.height(MeeshySpacing.md))
                            PostImageLayout(
                                images = post.images,
                                layout = post.layout,
                                onImageTap = { index ->
                                    gallery = FeedMediaGallery.of(post, index).takeUnless(FeedGallery::isEmpty)
                                },
                            )
                        }

                        post.reelCover?.takeIf { post.showsReelCard }?.let { cover ->
                            Spacer(Modifier.height(MeeshySpacing.md))
                            ReelPostCard(
                                post = post,
                                cover = cover,
                                onOpenReel = onOpenReel,
                                showsActions = false,
                                captionLines = DETAIL_CAPTION_LINES,
                                onOpenProfile = onOpenProfile,
                            )
                        } ?: FeedPostQuoteAndReel(post = post, onOpenPost = onOpenPost, onOpenReel = onOpenReel)

                        post.repostEmbed?.takeIf(::showsQuotedDetailMedia)?.let { embed ->
                            Spacer(Modifier.height(MeeshySpacing.md))
                            PostDetailMedia(
                                media = embed.media.filterNot { it.type == FeedMediaType.IMAGE },
                                owner = DetailMediaAuthor.of(embed),
                                accentHex = post.accentHex,
                                onOpenVisual = { index ->
                                    gallery = FeedMediaGallery.ofQuotedVisuals(embed.copy(media = embed.media.filterNot { it.type == FeedMediaType.IMAGE }), index)
                                        .takeUnless(FeedGallery::isEmpty)
                                },
                            )
                        }

                        Spacer(Modifier.height(MeeshySpacing.md))
                        DetailStatsRow(
                            post = post,
                            isReposted = isReposted,
                            onRepost = onRepost,
                            onQuote = onQuote,
                            onLike = onLike,
                            quickEmojis = quickEmojis,
                            onReact = onReact,
                            onBookmark = onBookmark,
                            onImager = if (post.showsReelCard) null else rememberPostImager(post),
                        )
                    }
                }

                Spacer(Modifier.height(MeeshySpacing.lg))
                commentsSection()
            }
            Box(Modifier.align(Alignment.BottomCenter)) { snackbarHost() }
        }
        Box(Modifier.fillMaxWidth().imePadding()) { commentComposer() }
    }
}

private const val DETAIL_CAPTION_LINES = 6

/** La citation d'un post ordinaire porte, dans le détail, ses vidéos, audios et documents (l'image a déjà son aperçu dans la citation). */
private fun showsQuotedDetailMedia(embed: RepostEmbedPresentation): Boolean =
    !embed.isStory && !embed.isReel && !embed.isUnavailable && embed.media.any { it.type != FeedMediaType.IMAGE }

/** « Vues » : l'entrée de la liste de qui a vu (ADMIN/BIGBOSS), même libellé qu'iOS. */
@Composable
private fun ViewersEntry(onClick: () -> Unit) {
    val label = stringResource(R.string.post_detail_viewers)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .padding(top = MeeshySpacing.xs)
            .clickable(onClick = onClick)
            .semantics { role = Role.Button; contentDescription = label },
    ) {
        Icon(Icons.Filled.Visibility, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(14.dp))
        Text(text = label, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
    }
}

/**
 * The author-only "@pseudo · views · impressions" reach line — port of iOS `PostDetailView`'s
 * `authorRevealView`/`authorReachLine`. A reader who isn't the author sees only `@pseudo` (or
 * nothing at all, when the post carries neither a handle nor viewer-visible stats).
 */
@Composable
private fun PostReachLine(post: FeedPostPresentation) {
    val reach = PostReachFormatter.components(
        username = post.authorUsername,
        isAuthor = post.isAuthor,
        viewCount = post.viewCount,
        impressionCount = post.impressionCount,
        uniqueViewCount = post.uniqueViewCount,
    )
    if (reach.pseudo == null && reach.views == null) return
    val a11yLabel = stringResource(R.string.feed_post_reach_a11y)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = a11yLabel },
    ) {
        reach.pseudo?.let {
            Text(text = it, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
        }
        if (reach.views != null && reach.impressions != null) {
            if (reach.pseudo != null) {
                Text(text = "·", style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
            }
            Icon(Icons.Filled.Visibility, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(14.dp))
            Text(text = reach.views, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
            Text(text = "·", style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
            Icon(Icons.Filled.BarChart, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(14.dp))
            Text(text = reach.impressions, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
            reach.uniqueViews?.let { people ->
                Text(text = "·", style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
                Icon(Icons.Filled.Person, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(14.dp))
                Text(text = people, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DetailLanguageStrip(
    chips: List<LanguageChip>,
    onChipTap: (String) -> Unit,
    onOpenExplorer: (() -> Unit)? = null,
) {
    FlowRow(
        verticalArrangement = Arrangement.Center,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        PostTranslationsBadge(onOpenExplorer)
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
                    .background(if (chip.isActive) accent.copy(alpha = 0.16f) else Color.Transparent)
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

@Composable
private fun PostDetailSkeleton() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshySkeletonBox(
            modifier = Modifier
                .fillMaxWidth()
                .height(80.dp),
            shape = RoundedCornerShape(MeeshyRadius.xl),
        )
        MeeshySkeletonBox(
            modifier = Modifier
                .fillMaxWidth()
                .height(220.dp),
            shape = RoundedCornerShape(MeeshyRadius.xl),
        )
    }
}

@Composable
internal fun detailRelativeTime(iso: String): String {
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
