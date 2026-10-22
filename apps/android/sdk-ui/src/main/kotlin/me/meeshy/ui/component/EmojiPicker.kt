package me.meeshy.ui.component

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.sdk.model.EmojiCategoryId
import me.meeshy.sdk.model.EmojiPickerPresenter
import me.meeshy.sdk.reaction.SharedPrefsRecentEmojiStore
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Horizontal quick-reaction strip — port of `EmojiReactionPicker`'s quick bar
 * (EmojiReactionPicker.swift). The caller passes a usage-ordered [emojis] list
 * (see `EmojiUsageRanker`); a trailing "+" opens the full picker.
 *
 * The strip sits inside a pill so it keeps the anchored "floating bar" look of
 * the iOS quick-reaction overlay. Emojis the user already reacted with are
 * highlighted in the brand accent.
 */
@Composable
fun EmojiQuickStrip(
    emojis: List<String>,
    onReact: (String) -> Unit,
    modifier: Modifier = Modifier,
    accentColor: Color = MeeshyPalette.Indigo500,
    ownReactions: Set<String> = emptySet(),
    onExpand: (() -> Unit)? = null,
    highlightedIndex: Int? = null,
    onTileBounds: ((Int, Rect) -> Unit)? = null,
) {
    // Scrub mode (bounds requested): keep the pill as a BACKGROUND shape only,
    // without clipping — a hovered tile scaled ×1.35 must overflow the pill.
    // Non-scrub callers (chat) keep the original clipped pill.
    val scrubMode = onTileBounds != null
    Row(
        modifier = modifier
            .let { base ->
                if (scrubMode) {
                    base.background(
                        MeeshyTheme.tokens.backgroundSecondary,
                        RoundedCornerShape(MeeshyRadius.pill),
                    )
                } else {
                    base
                        .clip(RoundedCornerShape(MeeshyRadius.pill))
                        .background(MeeshyTheme.tokens.backgroundSecondary)
                }
            }
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        emojis.forEachIndexed { index, emoji ->
            EmojiTile(
                emoji = emoji,
                isMine = emoji in ownReactions,
                isHighlighted = highlightedIndex == index,
                accentColor = accentColor,
                onClick = { onReact(emoji) },
                onBounds = onTileBounds?.let { report -> { rect -> report(index, rect) } },
            )
        }
        if (onExpand != null) {
            val expandLabel = stringResource(R.string.emoji_picker_expand)
            val plusIndex = emojis.size
            val plusScale by animateFloatAsState(
                targetValue = if (highlightedIndex == plusIndex) 1.35f else 1f,
                animationSpec = MeeshyMotion.bouncySpring(),
                label = "emojiPlusScale",
            )
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .let { base ->
                        val report = onTileBounds
                        if (report != null) {
                            base.onGloballyPositioned { report(plusIndex, it.boundsInRoot()) }
                        } else {
                            base
                        }
                    }
                    .graphicsLayer { scaleX = plusScale; scaleY = plusScale }
                    .clip(CircleShape)
                    .background(MeeshyTheme.tokens.backgroundTertiary)
                    .clickable(onClick = onExpand)
                    .semantics { contentDescription = expandLabel },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.Add,
                    contentDescription = null,
                    tint = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

@Composable
private fun EmojiTile(
    emoji: String,
    isMine: Boolean,
    isHighlighted: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
    onBounds: ((Rect) -> Unit)?,
) {
    val reactLabel = stringResource(R.string.emoji_react_with, emoji)
    val scale by animateFloatAsState(
        targetValue = if (isHighlighted) 1.35f else 1f,
        animationSpec = MeeshyMotion.bouncySpring(),
        label = "emojiTileScale",
    )
    Box(
        modifier = Modifier
            .size(36.dp)
            .let { base ->
                if (onBounds != null) base.onGloballyPositioned { onBounds(it.boundsInRoot()) } else base
            }
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(CircleShape)
            .background(if (isMine) accentColor.copy(alpha = 0.22f) else Color.Transparent)
            .let { base ->
                if (isMine) base.border(1.dp, accentColor, CircleShape) else base
            }
            .clickable(onClick = onClick)
            .semantics { contentDescription = reactLabel },
        contentAlignment = Alignment.Center,
    ) {
        Text(text = emoji, fontSize = 22.sp)
    }
}

/**
 * The picker's content with no host — search field, ten category tabs and a virtualized grid —
 * so a bottom sheet, a dialog or the composer dock can embed it as it is (iOS `EmojiPickerView`).
 * One body serves inserting into the field, sending a quick emoji and choosing a reaction.
 *
 * It is stateless about persistence: [recentEmojis] (most recent first) comes from the host,
 * and every tap reaches [onSelect]. The catalog is built off the main thread on first use
 * ([rememberEmojiCatalog]); until then the grid is a skeleton.
 */
@Composable
public fun EmojiPickerContent(
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    accentColor: Color = MeeshyPalette.Indigo500,
    quickReactions: List<String> = EmojiCatalog.defaultQuickReactions,
    recentEmojis: List<String> = emptyList(),
) {
    val snapshot = rememberEmojiCatalog()
    var query by rememberSaveable { mutableStateOf("") }
    var selectedKey by rememberSaveable { mutableStateOf(EmojiCategoryId.RECENT.key) }
    val selected = EmojiCategoryId.fromKey(selectedKey) ?: EmojiCategoryId.RECENT
    val page = remember(snapshot, query, selected, quickReactions, recentEmojis) {
        snapshot?.let {
            EmojiPickerPresenter.page(
                query = query,
                selected = selected,
                snapshot = it,
                quickReactions = quickReactions,
                recents = recentEmojis,
            )
        }
    }

    Column(modifier = modifier.fillMaxWidth()) {
        EmojiPickerSearchField(
            query = query,
            onQueryChange = { query = it },
            accentColor = accentColor,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
        if (EmojiPickerPresenter.showsTabs(query)) {
            EmojiCategoryTabs(
                selected = selected,
                accentColor = accentColor,
                onSelect = { selectedKey = it.key },
            )
        }
        HorizontalDivider(color = MeeshyTheme.tokens.inputBorder)
        EmojiPickerBody(
            page = page,
            scrollKey = selected to query,
            onSelect = onSelect,
        )
    }
}

/**
 * The picker as a titled sheet body — the entry the chat composer, the reaction choice and the
 * story viewer already call. Wraps [EmojiPickerContent], feeds it the persisted « used recently »
 * history and records every pick into it. Designed to be hosted inside a `ModalBottomSheet` by
 * the caller, which keeps presentation (sheet vs. dialog) app-side.
 */
@Composable
public fun EmojiFullPicker(
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    accentColor: Color = MeeshyPalette.Indigo500,
    quickReactions: List<String> = EmojiCatalog.defaultQuickReactions,
    title: String = stringResource(R.string.emoji_picker_title),
) {
    val context = LocalContext.current
    val recentStore = remember(context) { SharedPrefsRecentEmojiStore.shared(context) }
    val recents by recentStore.history.collectAsState()

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.padding(
                start = MeeshySpacing.lg,
                top = MeeshySpacing.sm,
            ),
        )
        EmojiPickerContent(
            onSelect = { emoji ->
                recentStore.record(emoji)
                onSelect(emoji)
            },
            accentColor = accentColor,
            quickReactions = quickReactions,
            recentEmojis = recents,
        )
    }
}
