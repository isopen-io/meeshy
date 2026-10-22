package me.meeshy.app.stories

import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R

/**
 * Mini-preview strip of the multi-slide deck — the structural surface of the
 * upcoming canvas. Each slide is a numbered, selectable chip (tap to switch); the
 * selected chip carries Duplicate / Remove actions (Remove hidden on the last
 * remaining slide). A trailing "+" chip appends a slide, disabled at the ≤10 cap.
 * A horizontal drag on a chip reorders it: the accumulated pixels and the measured
 * slot width feed the pure, unit-tested [SlideReorderResolver], which yields the
 * clamped target index handed to [onMove] on drag end.
 * Pure glue: every decision (cap, can-remove, selection, reorder target) is read
 * off the already unit-tested [StorySlideDeck]/[SlideReorderResolver]; this only
 * renders the deck and forwards intents.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SlideStrip(
    deck: StorySlideDeck,
    onSelect: (String) -> Unit,
    onAdd: () -> Unit,
    onDuplicate: () -> Unit,
    onRemove: (String) -> Unit,
    onMove: (String, Int) -> Unit,
) {
    val spacingPx = with(LocalDensity.current) { 8.dp.toPx() }
    var chipWidthPx by remember { mutableFloatStateOf(0f) }
    LazyRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        itemsIndexed(deck.slides, key = { _, slide -> slide.id }) { index, slide ->
            val selected = slide.id == deck.selectedId
            FilterChip(
                selected = selected,
                onClick = { onSelect(slide.id) },
                modifier = Modifier
                    .onSizeChanged { chipWidthPx = it.width.toFloat() }
                    .pointerInput(slide.id, index, deck.size) {
                        var totalDrag = 0f
                        detectHorizontalDragGestures(
                            onDragStart = { totalDrag = 0f },
                            onDragEnd = {
                                onMove(
                                    slide.id,
                                    SlideReorderResolver.targetIndex(
                                        fromIndex = index,
                                        dragPx = totalDrag,
                                        slotWidthPx = chipWidthPx + spacingPx,
                                        slideCount = deck.size,
                                    ),
                                )
                            },
                        ) { change, dragAmount ->
                            change.consume()
                            totalDrag += dragAmount
                        }
                    },
                label = { Text(stringResource(R.string.stories_composer_slide_label, index + 1)) },
                trailingIcon = if (selected && deck.canRemoveSlide) {
                    {
                        IconButton(onClick = { onRemove(slide.id) }, modifier = Modifier.size(18.dp)) {
                            Icon(
                                Icons.Filled.Close,
                                contentDescription = stringResource(R.string.stories_composer_remove_slide),
                            )
                        }
                    }
                } else {
                    null
                },
            )
        }
        item {
            IconButton(onClick = onDuplicate, enabled = deck.canAddSlide) {
                Icon(
                    Icons.Filled.ContentCopy,
                    contentDescription = stringResource(R.string.stories_composer_duplicate_slide),
                )
            }
        }
        item {
            AssistChip(
                onClick = onAdd,
                enabled = deck.canAddSlide,
                label = { Text(stringResource(R.string.stories_composer_add_slide)) },
                leadingIcon = { Icon(Icons.Filled.Add, contentDescription = null) },
            )
        }
    }
}
