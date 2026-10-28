package me.meeshy.app.stories

import android.graphics.Bitmap
import android.widget.Toast
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.core.graphics.drawable.toBitmap
import coil.imageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import coil.size.Scale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerHeaderTiles
import me.meeshy.sdk.model.composer.ComposerSceneAddition
import me.meeshy.sdk.model.composer.ComposerSlideDeletion
import me.meeshy.sdk.model.composer.ComposerSlideDrag
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.ComposerPlateauInk
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private const val TILE_HEIGHT_DP = 44
private const val SCENE_ASPECT = 9f / 16f
private const val DRAG_LIFT_SCALE = 1.1f

/**
 * One tile per scene (iOS `ComposerSlideRail`): the thumbnail of its scene, the current one ringed in the brand colour, a
 * tap to switch, the bin on the current tile only. A long press lifts a tile (with a haptic) and a horizontal drag carries it
 * across the others, which step aside; each slot crossed ticks, the drop commits. Deleting a scene that holds something asks
 * first. Out of cap, (+) and duplicate SAY why they do nothing — a greyed button explains nothing ([rememberGuardedAddition]).
 * The ten tiles fit the narrowest phone, so the row never scrolls and never competes with the drag.
 */
@Composable
internal fun ComposerSlideRail(
    deck: StorySlideDeck,
    backgrounds: Map<String, ThumbnailBackground?>,
    accentHex: String,
    onSelect: (String) -> Unit,
    onAdd: () -> Unit,
    onDuplicate: () -> Unit,
    onRemove: (String) -> Unit,
    onMove: (String, Int) -> Unit,
    modifier: Modifier = Modifier,
    showsAdd: Boolean = true,
    scenePresent: Boolean = true,
) {
    if (!ComposerHeaderTiles.showsRail(deck.size, scenePresent)) return
    val density = LocalDensity.current
    val haptics = rememberMeeshyHaptics()
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val tileWidth = (TILE_HEIGHT_DP * SCENE_ASPECT).dp
    val slotPx = with(density) { (tileWidth + MeeshySpacing.sm).toPx() }
    var dragFrom by remember { mutableIntStateOf(NO_DRAG) }
    var dragPx by remember { mutableFloatStateOf(0f) }
    var lastTarget by remember { mutableIntStateOf(NO_DRAG) }
    var pendingRemoval by remember { mutableStateOf<String?>(null) }
    val target = if (dragFrom == NO_DRAG) NO_DRAG else SlideReorderResolver.targetIndex(dragFrom, dragPx * if (rtl) -1f else 1f, slotPx, deck.size)
    LaunchedEffect(target) {
        if (dragFrom != NO_DRAG && ComposerSlideDrag.ticks(lastTarget, target)) haptics.selection()
        lastTarget = target
    }
    val railName = stringResource(R.string.composer_slide_rail)
    Row(
        modifier = modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xs).semantics { contentDescription = railName },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        deck.slides.forEachIndexed { index, slide ->
            val shift = slotShift(index, dragFrom, target, slotPx, rtl)
            SlideTile(
                slide = slide,
                index = index,
                count = deck.size,
                currentIndex = deck.selectedIndex,
                spec = rememberTileSpec(slide, backgrounds[slide.id], accentHex, tileWidth),
                backgroundModel = backgrounds[slide.id]?.model,
                tileWidth = tileWidth,
                isDragged = dragFrom == index,
                dragPx = dragPx,
                shift = shift,
                onSelect = onSelect,
                onDelete = { id ->
                    val holds = deck.slides.firstOrNull { it.id == id }?.holdsMatter() == true
                    if (ComposerSlideDeletion.needsConfirmation(holds)) pendingRemoval = id else onRemove(id)
                },
                onMove = onMove,
                onDragStart = { dragFrom = index; dragPx = 0f; lastTarget = index; haptics.medium() },
                onDrag = { dragPx += it },
                onDragEnd = {
                    val to = target
                    dragFrom = NO_DRAG; dragPx = 0f
                    if (to != NO_DRAG && to != index) onMove(slide.id, to)
                },
                onDragCancel = { dragFrom = NO_DRAG; dragPx = 0f },
            )
        }
        IconButton(onClick = onDuplicate) {
            Icon(MeeshyIcons.Copy, contentDescription = stringResource(R.string.stories_composer_duplicate_slide))
        }
        if (showsAdd) IconButton(onClick = onAdd) {
            Icon(MeeshyIcons.Add, contentDescription = stringResource(R.string.stories_composer_add_slide))
        }
    }
    pendingRemoval?.let { id ->
        AlertDialog(
            onDismissRequest = { pendingRemoval = null },
            title = { Text(stringResource(R.string.stories_composer_remove_slide_title)) },
            text = { Text(stringResource(R.string.stories_composer_remove_slide_message)) },
            confirmButton = {
                TextButton(onClick = { pendingRemoval = null; onRemove(id) }) {
                    Text(stringResource(R.string.stories_composer_remove_slide_confirm))
                }
            },
            dismissButton = { TextButton(onClick = { pendingRemoval = null }) { Text(stringResource(R.string.stories_cancel)) } },
        )
    }
}

private const val NO_DRAG = -1

/** How far a tile steps aside while [dragFrom] is carried toward [target]: one slot, toward the gap the dragged tile leaves. */
internal fun slotShift(index: Int, dragFrom: Int, target: Int, slotPx: Float, rtl: Boolean): Float {
    if (dragFrom == NO_DRAG || index == dragFrom) return 0f
    val direction = if (rtl) -1f else 1f
    return when {
        dragFrom < target && index in (dragFrom + 1)..target -> -slotPx * direction
        dragFrom > target && index in target until dragFrom -> slotPx * direction
        else -> 0f
    }
}

/** A scene that holds something the author would regret losing: content, media, sound, or a chosen backdrop. */
internal fun StorySlide.holdsMatter(): Boolean =
    text.isNotBlank() || mediaIds.isNotEmpty() || elements.any { it.isPublishable } || stickers.any { it.isPublishable } ||
        strokes.isNotEmpty() || audio.isNotEmpty() || background != null

@Composable
private fun rememberTileSpec(slide: StorySlide, background: ThumbnailBackground?, accentHex: String, tileWidth: Dp): SlideThumbnailSpec {
    val density = LocalDensity.current
    return remember(slide, background?.key, accentHex, tileWidth, density.density) {
        with(density) {
            SlideThumbnailSpec.of(
                slide = slide,
                backgroundKey = background?.key,
                accentHex = accentHex,
                widthPx = tileWidth.roundToPx(),
                heightPx = TILE_HEIGHT_DP.dp.roundToPx(),
            )
        }
    }
}

@Composable
private fun SlideTile(
    slide: StorySlide,
    index: Int,
    count: Int,
    currentIndex: Int,
    spec: SlideThumbnailSpec,
    backgroundModel: Any?,
    tileWidth: Dp,
    isDragged: Boolean,
    dragPx: Float,
    shift: Float,
    onSelect: (String) -> Unit,
    onDelete: (String) -> Unit,
    onMove: (String, Int) -> Unit,
    onDragStart: () -> Unit,
    onDrag: (Float) -> Unit,
    onDragEnd: () -> Unit,
    onDragCancel: () -> Unit,
) {
    val isCurrent = index == currentIndex
    val navigates = ComposerHeaderTiles.tilesNavigate(count)
    val animatedShift by animateFloatAsState(targetValue = shift, label = "slideTileShift")
    val position = stringResource(R.string.composer_slide_rail_position, index + 1, count)
    val moveBefore = stringResource(R.string.stories_composer_slide_move_earlier)
    val moveAfter = stringResource(R.string.stories_composer_slide_move_later)
    val ring = if (isCurrent) MaterialTheme.colorScheme.primary else LocalContentColor.current.copy(alpha = 0.25f)
    Box(
        modifier = Modifier
            .graphicsLayer {
                translationX = if (isDragged) dragPx else animatedShift
                val lift = if (isDragged) DRAG_LIFT_SCALE else 1f
                scaleX = lift
                scaleY = lift
            }
            .then(if (isDragged) Modifier.shadow(MeeshySpacing.xs, RoundedCornerShape(MeeshyRadius.xxs)) else Modifier),
    ) {
        Box(
            modifier = Modifier
                .size(width = tileWidth, height = TILE_HEIGHT_DP.dp)
                .clip(RoundedCornerShape(MeeshyRadius.xxs))
                .border(if (isCurrent) 1.5.dp else 0.5.dp, ring, RoundedCornerShape(MeeshyRadius.xxs))
                .pointerInput(slide.id, index, count) {
                    detectDragGesturesAfterLongPress(
                        onDragStart = { onDragStart() },
                        onDrag = { change, amount -> change.consume(); onDrag(amount.x) },
                        onDragEnd = onDragEnd,
                        onDragCancel = onDragCancel,
                    )
                }
                .clickable(enabled = navigates, role = Role.Button) { onSelect(slide.id) }
                .clearAndSetSemantics {
                    contentDescription = position
                    selected = isCurrent
                    if (navigates) role = Role.Button
                    customActions = buildList {
                        if (index > 0) add(CustomAccessibilityAction(moveBefore) { onMove(slide.id, index - 1); true })
                        if (index < count - 1) add(CustomAccessibilityAction(moveAfter) { onMove(slide.id, index + 1); true })
                    }
                },
        ) {
            SlideThumbnail(spec = spec, backgroundModel = backgroundModel, modifier = Modifier.fillMaxSize())
        }
        if (ComposerHeaderTiles.showsDelete(sceneIndex = index, currentIndex = currentIndex, sceneCount = count)) {
            val label = stringResource(R.string.composer_slide_rail_delete, index + 1)
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = MeeshySpacing.xs, y = -MeeshySpacing.xs)
                    .size(DELETE_TARGET_DP.dp)
                    .clip(CircleShape)
                    .clickable(role = Role.Button) { onDelete(slide.id) }
                    .clearAndSetSemantics { contentDescription = label; role = Role.Button },
                contentAlignment = Alignment.TopEnd,
            ) {
                Box(
                    Modifier.size(DELETE_GLYPH_DP.dp).clip(CircleShape).background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.55f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(MeeshyIcons.Close, contentDescription = null, tint = ComposerPlateauInk.primary, modifier = Modifier.size(10.dp))
                }
            }
        }
    }
}

private const val DELETE_TARGET_DP = 28
private const val DELETE_GLYPH_DP = 16

/**
 * The picture of a scene. The bitmap comes from [SlideThumbnailStore] when this exact scene was painted before, otherwise it
 * is painted on `Dispatchers.Default` — never on the main thread — after a settling delay if a previous picture is on screen,
 * which stays in place meanwhile (no hole, no repaint per frame of a gesture). Black until the first picture exists.
 */
@Composable
private fun SlideThumbnail(spec: SlideThumbnailSpec, backgroundModel: Any?, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var shown by remember { mutableStateOf<Bitmap?>(SlideThumbnailStore.shared.get(spec)) }
    LaunchedEffect(spec) {
        SlideThumbnailStore.shared.get(spec)?.let { shown = it; return@LaunchedEffect }
        if (SlideThumbnailRefresh.waits(isShowingImage = shown != null, isCached = false, isBlank = spec.isBlank)) {
            delay(SlideThumbnailRefresh.DEBOUNCE_MILLIS)
        }
        val painted = withContext(Dispatchers.Default) {
            val image = backgroundModel?.let { loadThumbnailBackground(context, it, spec) }
            SlideThumbnailRenderer.render(spec, image).also { bitmap ->
                if (backgroundModel == null || image != null) SlideThumbnailStore.shared.put(spec, bitmap)
            }
        }
        shown = painted
    }
    Box(modifier.background(Color.Black)) {
        shown?.let { Image(bitmap = it.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
    }
}

private suspend fun loadThumbnailBackground(context: android.content.Context, model: Any, spec: SlideThumbnailSpec): Bitmap? {
    val request = ImageRequest.Builder(context)
        .data(model)
        .size(spec.widthPx, spec.heightPx)
        .scale(Scale.FILL)
        .allowHardware(false)
        .build()
    return (context.imageLoader.execute(request) as? SuccessResult)?.drawable?.toBitmap()
}

/**
 * Out of cap, adding says so (iOS `ComposerSceneAddition`, #13535): a warning haptic and a toast that names the cap. Wraps
 * [action] — the add or the duplicate — so the tap is never a silent no-op.
 */
@Composable
internal fun rememberGuardedAddition(canAdd: Boolean, action: () -> Unit): () -> Unit {
    val haptics = rememberMeeshyHaptics()
    val context = LocalContext.current
    val refusal = stringResource(R.string.composer_slide_rail_capReached)
    val latest = androidx.compose.runtime.rememberUpdatedState(action)
    return remember(canAdd, refusal) {
        {
            when (ComposerSceneAddition.outcome(canAdd)) {
                ComposerSceneAddition.ADDED -> latest.value()
                ComposerSceneAddition.REFUSED_AT_CAP -> {
                    haptics.error()
                    Toast.makeText(context, refusal, Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}
