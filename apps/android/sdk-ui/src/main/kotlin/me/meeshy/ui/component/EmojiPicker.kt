package me.meeshy.ui.component

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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.sdk.model.EmojiCategory
import me.meeshy.ui.R
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
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        emojis.forEach { emoji ->
            EmojiTile(
                emoji = emoji,
                isMine = emoji in ownReactions,
                accentColor = accentColor,
                onClick = { onReact(emoji) },
            )
        }
        if (onExpand != null) {
            val expandLabel = stringResource(R.string.emoji_picker_expand)
            Box(
                modifier = Modifier
                    .size(36.dp)
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
    accentColor: Color,
    onClick: () -> Unit,
) {
    val reactLabel = stringResource(R.string.emoji_react_with, emoji)
    Box(
        modifier = Modifier
            .size(36.dp)
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
 * Full categorised emoji picker — port of `EmojiFullPickerSheet`'s tabs + grid
 * (EmojiReactionPicker.swift). Designed to be hosted inside a `ModalBottomSheet`
 * by the caller, which keeps presentation (sheet vs. dialog) app-side.
 */
@Composable
fun EmojiFullPicker(
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    accentColor: Color = MeeshyPalette.Indigo500,
    categories: List<EmojiCategory> = EmojiCatalog.categories,
) {
    var selectedIndex by rememberSaveable { mutableIntStateOf(0) }
    val selected = categories.getOrElse(selectedIndex) { categories.first() }

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.emoji_picker_title),
            style = androidx.compose.material3.MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.padding(
                start = MeeshySpacing.lg,
                top = MeeshySpacing.sm,
                bottom = MeeshySpacing.sm,
            ),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.md),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            categories.forEachIndexed { index, category ->
                CategoryTab(
                    category = category,
                    isSelected = index == selectedIndex,
                    accentColor = accentColor,
                    onClick = { selectedIndex = index },
                )
            }
        }
        LazyVerticalGrid(
            columns = GridCells.Fixed(8),
            modifier = Modifier
                .fillMaxWidth()
                .padding(MeeshySpacing.sm),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            items(selected.emojis, key = { it }) { emoji ->
                val reactLabel = stringResource(R.string.emoji_react_with, emoji)
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .clickable { onSelect(emoji) }
                        .semantics { contentDescription = reactLabel },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(text = emoji, fontSize = 26.sp)
                }
            }
        }
    }
}

@Composable
private fun CategoryTab(
    category: EmojiCategory,
    isSelected: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(if (isSelected) accentColor.copy(alpha = 0.12f) else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = category.icon, fontSize = 20.sp)
        Text(
            text = categoryLabel(category.id),
            fontSize = 9.sp,
            fontWeight = FontWeight.Medium,
            color = if (isSelected) accentColor else MeeshyTheme.tokens.textSecondary,
        )
    }
}

@Composable
private fun categoryLabel(id: String): String = stringResource(
    when (id) {
        "reactions" -> R.string.emoji_category_reactions
        "faces" -> R.string.emoji_category_faces
        "gestures" -> R.string.emoji_category_gestures
        "hearts" -> R.string.emoji_category_hearts
        "animals" -> R.string.emoji_category_animals
        else -> R.string.emoji_category_objects
    },
)
