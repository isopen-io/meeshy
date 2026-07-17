package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material.icons.outlined.BookmarkBorder
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
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.bubble.LanguageChip
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.format.shortDateTimeLabel
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
    viewModel: PostDetailViewModel = hiltViewModel(),
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
                        Text(stringResource(R.string.post_detail_title), fontWeight = FontWeight.Bold)
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.post_detail_back),
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
                    state.showSkeleton -> PostDetailSkeleton()
                    state.post == null -> PostDetailPlaceholder(
                        message = stringResource(
                            if (state.notFound) R.string.post_detail_not_found
                            else R.string.post_detail_empty,
                        ),
                    )
                    else -> PostDetailContent(
                        post = state.post!!,
                        onFlagTap = viewModel::onFlagTap,
                    )
                }
            }
        }
    }
}

@Composable
private fun PostDetailContent(
    post: FeedPostPresentation,
    onFlagTap: (String) -> Unit,
) {
    val unknownAuthor = stringResource(R.string.feed_unknown_author)
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(MeeshySpacing.lg),
    ) {
        MeeshyGlassSurface(
            shape = RoundedCornerShape(MeeshyRadius.xl),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(MeeshySpacing.lg)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(contentAlignment = Alignment.Center) {
                        MeeshyAvatar(name = post.authorName ?: unknownAuthor, size = 44.dp)
                        if (!post.authorAvatarUrl.isNullOrBlank()) {
                            AsyncImage(
                                model = post.authorAvatarUrl,
                                contentDescription = post.authorName ?: unknownAuthor,
                                modifier = Modifier
                                    .size(44.dp)
                                    .clip(CircleShape),
                            )
                        }
                    }
                    Spacer(Modifier.width(MeeshySpacing.md))
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = post.authorName ?: unknownAuthor,
                                style = MaterialTheme.typography.titleSmall,
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
                                text = detailRelativeTime(it),
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
                            style = MaterialTheme.typography.bodyLarge,
                            color = MeeshyTheme.tokens.textPrimary,
                        )
                    }
                }

                if (post.languageStrip.isNotEmpty()) {
                    Spacer(Modifier.height(MeeshySpacing.sm))
                    DetailLanguageStrip(chips = post.languageStrip, onChipTap = onFlagTap)
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
                    Row(verticalAlignment = Alignment.CenterVertically) {
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

                Spacer(Modifier.height(MeeshySpacing.md))
                DetailStatsRow(post = post)
            }
        }
    }
}

@Composable
private fun DetailStatsRow(post: FeedPostPresentation) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DetailStat(
            icon = { tint ->
                Icon(Icons.Filled.Favorite, contentDescription = stringResource(R.string.feed_like), tint = tint, modifier = Modifier.size(18.dp))
            },
            count = post.likeCount,
            active = post.isLiked,
        )
        DetailStat(
            icon = { tint ->
                Icon(Icons.Filled.ChatBubbleOutline, contentDescription = stringResource(R.string.feed_comments), tint = tint, modifier = Modifier.size(18.dp))
            },
            count = post.commentCount,
            active = false,
        )
        DetailStat(
            icon = { tint ->
                Icon(Icons.Filled.Repeat, contentDescription = stringResource(R.string.feed_reposts), tint = tint, modifier = Modifier.size(18.dp))
            },
            count = post.repostCount,
            active = false,
        )
        DetailStat(
            icon = { tint ->
                Icon(Icons.Outlined.BookmarkBorder, contentDescription = stringResource(R.string.feed_bookmark), tint = tint, modifier = Modifier.size(18.dp))
            },
            count = post.bookmarkCount,
            active = post.isBookmarked,
        )
    }
}

@Composable
private fun DetailStat(
    icon: @Composable (Color) -> Unit,
    count: Int,
    active: Boolean,
) {
    val tint = if (active) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textSecondary
    Row(verticalAlignment = Alignment.CenterVertically) {
        icon(tint)
        if (count > 0) {
            Spacer(Modifier.width(MeeshySpacing.xs))
            Text(
                text = count.toString(),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DetailLanguageStrip(
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
private fun PostDetailPlaceholder(message: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = MeeshyTheme.tokens.textSecondary,
        )
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
private fun detailRelativeTime(iso: String): String {
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
