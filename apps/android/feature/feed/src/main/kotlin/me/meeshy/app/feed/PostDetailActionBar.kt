package me.meeshy.app.feed

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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

@Composable
internal fun DetailStatsRow(
    post: FeedPostPresentation,
    isReposted: Boolean,
    onRepost: () -> Unit,
    onQuote: () -> Unit,
    onLike: () -> Unit,
    quickEmojis: List<String>,
    onReact: (PostReactionPick) -> Unit,
    onBookmark: () -> Unit,
    onImager: (() -> Unit)? = null,
) {
    var palette by remember { mutableStateOf(PostReactionPaletteState()) }
    Row(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
        DetailStat(
            icon = { tint ->
                Icon(
                    if (post.isLiked) MeeshyIcons.HeartFilled else MeeshyIcons.FavoriteBorder,
                    contentDescription = stringResource(if (post.isLiked) R.string.feed_unlike else R.string.feed_like),
                    tint = tint,
                    modifier = Modifier.size(20.dp),
                )
            },
            count = post.likeCount,
            active = post.isLiked,
            activeTint = MeeshyPalette.Error,
            heart = true,
            onClick = onLike,
            triggerModifier = Modifier.reactionPaletteTrigger(onOpen = { palette = palette.opened() }),
        )
        PostReactionPalette(
            isOpen = palette.isOpen,
            onDismiss = { palette = palette.dismissed() },
            onPick = { emoji ->
                val (next, pick) = palette.picked(emoji)
                palette = next
                pick?.let(onReact)
            },
            emojis = quickEmojis,
            anchor = PostReactionPaletteAnchor.Start,
        )
        }
        DetailStat(
            icon = { tint ->
                Icon(MeeshyIcons.ChatBubbleOutline, contentDescription = stringResource(R.string.feed_comments), tint = tint, modifier = Modifier.size(18.dp))
            },
            count = post.commentCount,
            active = false,
        )
        DetailRepostStat(
            count = post.repostCount,
            active = isReposted,
            onRepost = onRepost,
            onQuote = onQuote,
        )
        DetailStat(
            icon = { tint ->
                Icon(
                    if (post.isBookmarked) MeeshyIcons.BookmarkFilled else MeeshyIcons.Bookmark,
                    contentDescription = stringResource(if (post.isBookmarked) R.string.feed_unbookmark else R.string.feed_bookmark),
                    tint = tint,
                    modifier = Modifier.size(20.dp),
                )
            },
            count = post.bookmarkCount,
            active = post.isBookmarked,
            onClick = onBookmark,
        )
        onImager?.let { ImagerWand(onClick = it, tint = MeeshyTheme.tokens.textSecondary, glyph = 20.dp) }
    }
}

@Composable
internal fun DetailStat(
    icon: @Composable (Color) -> Unit,
    count: Int,
    active: Boolean,
    activeTint: Color = MeeshyPalette.Indigo500,
    onClick: (() -> Unit)? = null,
    triggerModifier: Modifier = Modifier,
    heart: Boolean = false,
) {
    val tint = if (active) activeTint else MeeshyTheme.tokens.textSecondary
    val haptics = rememberMeeshyHaptics()
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = triggerModifier
            .defaultMinSize(minWidth = ENGAGEMENT_MIN_TARGET, minHeight = ENGAGEMENT_MIN_TARGET)
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .let { base -> if (onClick == null) base else base.clickable(role = Role.Button, onClick = { haptics.light(); onClick() }) }
            .padding(horizontal = MeeshySpacing.xs),
    ) {
        EngagementGlyph(active = active, tint = tint, size = 20.dp, burst = heart, tilt = heart) { icon(tint) }
        if (count > 0) {
            Spacer(Modifier.width(MeeshySpacing.xs))
            EngagementCount(count = count, color = MeeshyTheme.tokens.textSecondary)
        }
    }
}

/**
 * The repost stat, made interactive: a tap opens [RepostChoiceDialog] — the one choice every Repost button of a
 * publication offers (iOS `PostDetailView` + `RepostChoiceDialog`, #15911). The icon fills
 * once the reader has reposted (optimistic [active]); the menu items route to the ViewModel,
 * whose tested [RepostCommand] SSOT decides what to send.
 */
@Composable
internal fun DetailRepostStat(
    count: Int,
    active: Boolean,
    onRepost: () -> Unit,
    onQuote: () -> Unit,
) {
    var choosing by remember { mutableStateOf(false) }
    val tint = if (active) MeeshyPalette.Success else MeeshyTheme.tokens.textSecondary
    val a11y = stringResource(R.string.feed_reposts)
    val haptics = rememberMeeshyHaptics()
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .defaultMinSize(minWidth = ENGAGEMENT_MIN_TARGET, minHeight = ENGAGEMENT_MIN_TARGET)
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .clickable(role = Role.Button) { haptics.light(); choosing = true }
            .padding(horizontal = MeeshySpacing.xs)
            .semantics { contentDescription = a11y },
    ) {
        EngagementIcon(icon = MeeshyIcons.Repeat, active = active, tint = tint)
        if (count > 0) {
            Spacer(Modifier.width(MeeshySpacing.xs))
            EngagementCount(count = count, color = MeeshyTheme.tokens.textSecondary)
        }
    }
    if (choosing) RepostChoiceDialog(onRepost = onRepost, onQuote = onQuote, onDismiss = { choosing = false })
}

/** Zone tactile autour du glyphe d'une action d'engagement (iOS `engagementHitArea`, 44 pt ; Android : 48 dp). */
internal val ENGAGEMENT_MIN_TARGET = 48.dp
