package me.meeshy.ui.component

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.ReactionBarLaw
import me.meeshy.sdk.model.ReactionPickerCategories
import me.meeshy.sdk.model.ReactionPickerCategoryId
import me.meeshy.ui.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@Composable
private fun categoryName(id: ReactionPickerCategoryId): String = stringResource(
    when (id) {
        ReactionPickerCategoryId.REACTIONS -> R.string.emoji_category_reactions
        ReactionPickerCategoryId.FACES -> R.string.emoji_category_faces
        ReactionPickerCategoryId.GESTURES -> R.string.emoji_category_gestures
        ReactionPickerCategoryId.HEARTS -> R.string.emoji_category_hearts
        ReactionPickerCategoryId.ANIMALS -> R.string.emoji_category_animals
        ReactionPickerCategoryId.OBJECTS -> R.string.emoji_category_objects
    },
)

/**
 * The full reaction picker opened by the quick strip's « + » — port of iOS `EmojiFullPickerSheet`:
 * six labelled tabs (Reactions, Faces, Gestures, Hearts, Animals, Objects) over an eight-column
 * grid. The handle drags the sheet: down closes (or collapses an expanded sheet), up expands it.
 * The caller hosts it at the bottom of its overlay; presentation stays app-side.
 */
@Composable
public fun ReactionCategorySheet(
    onReact: (String) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    accentColor: Color = MeeshyPalette.Indigo500,
    title: String = stringResource(R.string.emoji_picker_title),
) {
    val density = LocalDensity.current
    val haptics = rememberMeeshyHaptics()
    var selectedKey by rememberSaveable { mutableStateOf(ReactionPickerCategoryId.REACTIONS.key) }
    var reacted by remember { mutableStateOf<String?>(null) }
    var sheetHeight by remember { mutableFloatStateOf(EmojiPickerLayout.MIN_HEIGHT_DP) }
    var dragOffset by remember { mutableFloatStateOf(0f) }
    val category = ReactionPickerCategories.all.firstOrNull { it.id.key == selectedKey }
        ?: ReactionPickerCategories.all.first()

    BoxWithConstraints(modifier = modifier.fillMaxWidth(), contentAlignment = Alignment.BottomCenter) {
        val containerDp = maxHeight.value
        val height = EmojiPickerLayout.currentHeight(sheetHeight, dragOffset, containerDp)
        val drag = rememberDraggableState { deltaPx -> dragOffset += deltaPx / density.density }
        Column(
            modifier = Modifier
                .widthIn(max = EmojiPickerLayout.MAX_WIDTH_DP.dp)
                .fillMaxWidth()
                .height(height.dp)
                .clip(RoundedCornerShape(topStart = MeeshyRadius.xxl, topEnd = MeeshyRadius.xxl))
                .background(MeeshyTheme.tokens.backgroundSecondary)
                .pointerInput(Unit) { detectTapGestures { } },
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .draggable(
                        state = drag,
                        orientation = Orientation.Vertical,
                        onDragStopped = { velocityPx ->
                            val predicted = dragOffset + velocityPx / density.density * VelocityProjectionSeconds
                            when (EmojiPickerLayout.dragOutcome(dragOffset, predicted, sheetHeight)) {
                                ReactionSheetDragOutcome.Dismiss -> onDismiss()
                                ReactionSheetDragOutcome.Collapse -> sheetHeight = EmojiPickerLayout.MIN_HEIGHT_DP
                                ReactionSheetDragOutcome.Expand -> sheetHeight = EmojiPickerLayout.maxHeight(containerDp)
                                ReactionSheetDragOutcome.Settle -> Unit
                            }
                            dragOffset = 0f
                        },
                    ),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Row(
                    modifier = Modifier
                        .padding(top = MeeshySpacing.sm)
                        .width(36.dp)
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(MeeshyTheme.tokens.textSecondary.copy(alpha = 0.4f)),
                ) {}
                Text(
                    text = title,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                    modifier = Modifier.padding(vertical = MeeshySpacing.xs),
                )
            }
            Row(
                modifier = Modifier
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                ReactionPickerCategories.all.forEach { entry ->
                    val isSelected = entry.id == category.id
                    val name = categoryName(entry.id)
                    Column(
                        modifier = Modifier
                            .heightIn(min = 48.dp)
                            .clip(RoundedCornerShape(MeeshyRadius.sm))
                            .background(if (isSelected) accentColor.copy(alpha = 0.18f) else Color.Transparent)
                            .clickable(role = Role.Tab) { selectedKey = entry.id.key }
                            .semantics(mergeDescendants = true) {
                                selected = isSelected
                                contentDescription = name
                            }
                            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(text = entry.id.icon, fontSize = 20.sp)
                        Text(
                            text = name,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Medium,
                            color = if (isSelected) accentColor else MeeshyTheme.tokens.textSecondary,
                        )
                    }
                }
            }
            LazyVerticalGrid(
                columns = GridCells.Fixed(EmojiPickerLayout.COLUMNS),
                modifier = Modifier.fillMaxWidth(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    horizontal = MeeshySpacing.sm,
                    vertical = MeeshySpacing.sm,
                ),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
            ) {
                items(category.emojis, key = { it }) { emoji ->
                    val scale by animateFloatAsState(
                        targetValue = if (reacted == emoji) ReactionBarLaw.HOVER_SCALE else 1f,
                        animationSpec = MeeshyMotion.bouncySpring(),
                        label = "reactionSheetEmoji",
                    )
                    Text(
                        text = emoji,
                        fontSize = 28.sp,
                        modifier = Modifier
                            .heightIn(min = 48.dp)
                            .graphicsLayer { scaleX = scale; scaleY = scale }
                            .clickable {
                                haptics.light()
                                reacted = emoji
                                onReact(emoji)
                            }
                            .semantics { contentDescription = emoji },
                    )
                }
            }
        }
    }
}

private const val VelocityProjectionSeconds = 0.1f
