package me.meeshy.ui.sticker

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.sticker.StickerUsageEntry
import me.meeshy.ui.R
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val STICKER_EMOJI_COLUMNS = 7
internal val StickerEmojiCellSize = 44.dp
private val StickerEmojiFontSize = 30.sp

/** Ce que les cellules d'une page savent faire : poser, savoir si c'est un favori, l'épingler. */
internal class StickerCellActions(
    val onPick: (StickerUsageEntry) -> Unit,
    val isFavorite: (StickerUsageEntry) -> Boolean,
    val onToggleFavorite: (StickerUsageEntry) -> Unit,
    val haptics: MeeshyHaptics,
)

/** Un en-tête de section sur toute la largeur de la grille. */
internal fun LazyGridScope.stickerSectionHeader(key: String, title: String) {
    item(key = "header:$key", span = { GridItemSpan(maxLineSpan) }, contentType = "header") {
        Text(
            text = title,
            color = MeeshyTheme.tokens.textSecondary,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.md, bottom = MeeshySpacing.xs),
        )
    }
}

/** Les glyphes d'une catégorie : cases de 44 dp, emoji de 30 sp, sur sept colonnes. */
internal fun LazyGridScope.stickerEmojiCells(prefix: String, emojis: List<String>, actions: StickerCellActions) {
    items(emojis.size, key = { "$prefix:${emojis[it]}" }, contentType = { "emoji" }) { index ->
        StickerEmojiCell(emojis[index], actions)
    }
}

@Composable
internal fun StickerEmojiCell(emoji: String, actions: StickerCellActions) {
    val label = stringResource(R.string.story_sticker_a11y, emoji)
    StickerEntryCell(StickerUsageEntry.emoji(emoji), label, actions) {
        Text(text = emoji, fontSize = StickerEmojiFontSize)
    }
}

/** Une case de 44 dp : un tap pose (haptique moyen), un appui long propose d'épingler. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun StickerEntryCell(
    entry: StickerUsageEntry,
    label: String,
    actions: StickerCellActions,
    content: @Composable () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Box(
            modifier = Modifier
                .size(StickerEmojiCellSize)
                .clip(RoundedCornerShape(10.dp))
                .combinedClickable(
                    onClick = {
                        actions.haptics.medium()
                        actions.onPick(entry)
                    },
                    onLongClick = {
                        actions.haptics.light()
                        menuOpen = true
                    },
                )
                .semantics { contentDescription = label },
            contentAlignment = Alignment.Center,
        ) {
            content()
            StickerFavoriteMenu(menuOpen, { menuOpen = false }, entry, actions)
        }
    }
}

/** L'appui long propose l'action DANS LE SENS COURANT : « Retirer des favoris » sur un épinglé, « Épingler » sinon. */
@Composable
internal fun StickerFavoriteMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    entry: StickerUsageEntry,
    actions: StickerCellActions,
) {
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        val pinned = actions.isFavorite(entry)
        DropdownMenuItem(
            text = {
                Text(stringResource(if (pinned) R.string.sticker_sheet_unpin else R.string.sticker_sheet_pin))
            },
            onClick = {
                actions.onToggleFavorite(entry)
                onDismiss()
            },
        )
    }
}
