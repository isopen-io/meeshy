package me.meeshy.ui.component

import android.provider.Settings
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.EmojiEmotions
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Pets
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.EmojiCategoryId
import me.meeshy.sdk.model.EmojiPickerPage
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val CellMinSize = 48.dp
private val GridEmojiSize = 26.sp
private val QuickEmojiSize = 32.sp
private const val PressedScale = 1.3f
private const val SkeletonCells = 32

/** Tab glyph per category — the Material counterpart of the iOS SF Symbols (clock, face.smiling, …). */
private fun categoryIcon(id: EmojiCategoryId): ImageVector = when (id) {
    EmojiCategoryId.RECENT -> Icons.Filled.Schedule
    EmojiCategoryId.SMILEYS -> Icons.Filled.EmojiEmotions
    EmojiCategoryId.PEOPLE -> Icons.Filled.People
    EmojiCategoryId.ANIMALS -> Icons.Filled.Pets
    EmojiCategoryId.FOOD -> Icons.Filled.Restaurant
    EmojiCategoryId.ACTIVITIES -> Icons.Filled.SportsSoccer
    EmojiCategoryId.TRAVEL -> Icons.Filled.DirectionsCar
    EmojiCategoryId.OBJECTS -> Icons.Filled.Lightbulb
    EmojiCategoryId.SYMBOLS -> Icons.Filled.Favorite
    EmojiCategoryId.FLAGS -> Icons.Filled.Flag
}

@Composable
private fun categoryLabel(id: EmojiCategoryId): String = stringResource(
    when (id) {
        EmojiCategoryId.RECENT -> R.string.emoji_category_recent
        EmojiCategoryId.SMILEYS -> R.string.emoji_category_smileys
        EmojiCategoryId.PEOPLE -> R.string.emoji_category_people
        EmojiCategoryId.ANIMALS -> R.string.emoji_category_animals
        EmojiCategoryId.FOOD -> R.string.emoji_category_food
        EmojiCategoryId.ACTIVITIES -> R.string.emoji_category_activities
        EmojiCategoryId.TRAVEL -> R.string.emoji_category_travel
        EmojiCategoryId.OBJECTS -> R.string.emoji_category_objects
        EmojiCategoryId.SYMBOLS -> R.string.emoji_category_symbols
        EmojiCategoryId.FLAGS -> R.string.emoji_category_flags
    },
)

/** The icon-only tab strip. Each tab names itself to TalkBack and reports its selection. */
@Composable
internal fun EmojiCategoryTabs(
    selected: EmojiCategoryId,
    accentColor: Color,
    onSelect: (EmojiCategoryId) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        EmojiCategoryId.entries.forEach { id ->
            CategoryTab(
                id = id,
                isSelected = id == selected,
                accentColor = accentColor,
                onClick = { onSelect(id) },
            )
        }
    }
}

@Composable
private fun CategoryTab(
    id: EmojiCategoryId,
    isSelected: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
) {
    val label = categoryLabel(id)
    Box(
        modifier = Modifier
            .size(CellMinSize)
            .selectable(selected = isSelected, role = Role.Tab, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(width = 40.dp, height = 32.dp)
                .clip(RoundedCornerShape(MeeshyRadius.sm))
                .background(if (isSelected) accentColor else MeeshyTheme.tokens.backgroundTertiary),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = categoryIcon(id),
                contentDescription = null,
                tint = if (isSelected) Color.White else MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

/**
 * The picker body: one virtualized grid whatever the page — search hits, a category, or the
 * recent tab (quick reactions, then the usage history). A `null` [page] is the cold start
 * before the catalog is built: a skeleton grid, never a spinner.
 */
@Composable
internal fun EmojiPickerBody(
    page: EmojiPickerPage?,
    scrollKey: Any,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val gridState = rememberLazyGridState()
    LaunchedEffect(scrollKey) { gridState.scrollToItem(0) }
    val reduceMotion = rememberReducedMotion()
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = CellMinSize),
        state = gridState,
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        when (page) {
            null -> items(SkeletonCells, key = { "skeleton:$it" }, contentType = { "skeleton" }) {
                MeeshySkeletonBox(
                    modifier = Modifier.padding(MeeshySpacing.sm).size(32.dp),
                    shape = CircleShape,
                )
            }
            is EmojiPickerPage.Recents -> recentsSections(page, reduceMotion, onSelect)
            is EmojiPickerPage.Category -> emojiCells("category", page.emojis, GridEmojiSize, reduceMotion, onSelect)
            is EmojiPickerPage.Search -> emojiCells("search", page.results, GridEmojiSize, reduceMotion, onSelect)
            EmojiPickerPage.NoResults -> item(
                key = "no-results",
                span = { GridItemSpan(maxLineSpan) },
                contentType = "empty",
            ) { NoResults() }
        }
    }
}

private fun LazyGridScope.recentsSections(
    page: EmojiPickerPage.Recents,
    reduceMotion: Boolean,
    onSelect: (String) -> Unit,
) {
    if (page.quickReactions.isNotEmpty()) {
        sectionHeader("quick", Icons.Filled.EmojiEmotions, R.string.emoji_quick_reactions)
        emojiCells("quick", page.quickReactions, QuickEmojiSize, reduceMotion, onSelect)
    }
    if (page.recents.isNotEmpty()) {
        sectionHeader("recent", Icons.Filled.Schedule, R.string.emoji_recent)
        emojiCells("recent", page.recents, GridEmojiSize, reduceMotion, onSelect)
    }
}

private fun LazyGridScope.sectionHeader(id: String, icon: ImageVector, titleRes: Int) {
    item(key = "header:$id", span = { GridItemSpan(maxLineSpan) }, contentType = "header") {
        Row(
            modifier = Modifier.padding(horizontal = MeeshySpacing.xs, vertical = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = stringResource(titleRes),
                color = MeeshyTheme.tokens.textSecondary,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

private fun LazyGridScope.emojiCells(
    scope: String,
    emojis: List<String>,
    fontSize: TextUnit,
    reduceMotion: Boolean,
    onSelect: (String) -> Unit,
) {
    items(emojis, key = { "$scope:$it" }, contentType = { "emoji" }) { emoji ->
        EmojiCell(emoji = emoji, fontSize = fontSize, reduceMotion = reduceMotion, onSelect = onSelect)
    }
}

/**
 * One tappable emoji: at least 48 dp, a brief spring scale-up while pressed (held still when
 * the system asks to reduce motion) and a light haptic tick on selection.
 */
@Composable
private fun EmojiCell(
    emoji: String,
    fontSize: TextUnit,
    reduceMotion: Boolean,
    onSelect: (String) -> Unit,
) {
    val interactions = remember { MutableInteractionSource() }
    val pressed by interactions.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && !reduceMotion) PressedScale else 1f,
        animationSpec = MeeshyMotion.bouncySpring(),
        label = "emojiCellScale",
    )
    val haptic = LocalHapticFeedback.current
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = CellMinSize)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clickable(interactionSource = interactions, indication = null, role = Role.Button) {
                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onSelect(emoji)
            },
        contentAlignment = Alignment.Center,
    ) {
        Text(text = emoji, fontSize = fontSize)
    }
}

@Composable
private fun NoResults() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xxxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(
            imageVector = Icons.Filled.SearchOff,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textMuted,
            modifier = Modifier.size(40.dp),
        )
        Text(
            text = stringResource(R.string.emoji_search_no_results),
            color = MeeshyTheme.tokens.textSecondary,
            fontSize = 14.sp,
            textAlign = TextAlign.Center,
        )
    }
}

/** True when the user turned system animations off (animator scale 0) — the picker then skips its tap pulse. */
@Composable
private fun rememberReducedMotion(): Boolean {
    val resolver = LocalContext.current.contentResolver
    return remember(resolver) {
        Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
}
