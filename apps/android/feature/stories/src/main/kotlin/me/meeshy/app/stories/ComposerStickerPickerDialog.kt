package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.stories.R

/**
 * The emoji sticker picker — category tabs ([StickerCategory]) plus a live search field,
 * both driven by the pure [StickerPickerState] so the "what is visible" decision is
 * unit-tested in one place (a non-blank query searches across every category and the tab
 * row is hidden). Tapping an emoji forwards it to [onPick] (which adds it to the canvas
 * and closes the dialog). Pure glue.
 */
@Composable
internal fun StickerPickerDialog(
    onPick: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var picker by remember { mutableStateOf(StickerPickerState()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.stories_composer_cancel))
            }
        },
        title = { Text(stringResource(R.string.stories_composer_add_sticker)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = picker.query,
                    onValueChange = { picker = picker.withQuery(it) },
                    singleLine = true,
                    placeholder = { Text(stringResource(R.string.stories_composer_sticker_search)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                if (!picker.isSearching) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(StickerCategory.values().toList()) { category ->
                            FilterChip(
                                selected = picker.category == category,
                                onClick = { picker = picker.withCategory(category) },
                                label = { Text(category.label()) },
                            )
                        }
                    }
                }
                val visible = picker.visibleEmojis
                if (visible.isEmpty()) {
                    Text(
                        text = stringResource(R.string.stories_composer_sticker_no_results),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(vertical = 16.dp),
                    )
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(STICKER_PICKER_COLUMNS),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        gridItems(visible) { emoji ->
                            Text(
                                text = emoji,
                                fontSize = STICKER_PICKER_FONT_SIZE,
                                textAlign = TextAlign.Center,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .clickable { onPick(emoji) }
                                    .padding(8.dp),
                            )
                        }
                    }
                }
            }
        },
    )
}

@Composable
internal fun StickerCategory.label(): String = stringResource(
    when (this) {
        StickerCategory.SMILEYS -> R.string.stories_composer_sticker_cat_smileys
        StickerCategory.ANIMALS -> R.string.stories_composer_sticker_cat_animals
        StickerCategory.FOOD -> R.string.stories_composer_sticker_cat_food
        StickerCategory.ACTIVITIES -> R.string.stories_composer_sticker_cat_activities
        StickerCategory.TRAVEL -> R.string.stories_composer_sticker_cat_travel
        StickerCategory.OBJECTS -> R.string.stories_composer_sticker_cat_objects
        StickerCategory.SYMBOLS -> R.string.stories_composer_sticker_cat_symbols
        StickerCategory.FLAGS -> R.string.stories_composer_sticker_cat_flags
    },
)

internal const val STICKER_PICKER_COLUMNS = 6

internal val STICKER_PICKER_FONT_SIZE = 28.sp
