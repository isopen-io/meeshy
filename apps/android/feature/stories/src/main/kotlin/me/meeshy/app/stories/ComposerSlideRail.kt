package me.meeshy.app.stories

import android.graphics.Bitmap
import android.widget.Toast
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
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
import me.meeshy.ui.component.composer.SlideRailGeometry
import me.meeshy.sdk.model.composer.SlideThumbEditAffordance
import me.meeshy.ui.component.composer.SlideRailTile
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private const val DRAG_LIFT_SCALE = 1.1f

/**
 * One tile per scene (iOS `ComposerSlideRail`): the thumbnail of its scene, the current one ringed in the brand colour, a
 * tap to switch, the bin on the current tile only. A long press lifts a tile (with a haptic) and a horizontal drag carries it
 * across the others, which step aside; each slot crossed ticks, the drop commits. Deleting a scene that holds something asks
 * first. A long press released without crossing a slot opens the tile's menu — Duplicate, Delete — where iOS puts them
 * (the context menu of its slide strip). Out of cap, (+) and duplicate SAY why they do nothing — a greyed button explains
 * nothing ([rememberGuardedAddition]). The ten tiles fit the narrowest phone, so the row never scrolls and never competes
 * with the drag.
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
    onEditBackground: ((String) -> Unit)? = null,
) {
    if (!ComposerHeaderTiles.showsRail(deck.size, scenePresent)) return
    val density = LocalDensity.current
    val haptics = rememberMeeshyHaptics()
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val tileWidth = SlideRailGeometry.TileWidth
    val slotPx = with(density) { (tileWidth + MeeshySpacing.sm).toPx() }
    var dragFrom by remember { mutableIntStateOf(NO_DRAG) }
    var dragPx by remember { mutableFloatStateOf(0f) }
    var lastTarget by remember { mutableIntStateOf(NO_DRAG) }
    var pendingRemoval by remember { mutableStateOf<String?>(null) }
    var menuFor by remember { mutableStateOf<String?>(null) }
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
            val requestRemoval: (String) -> Unit = { id ->
                val holds = deck.slides.firstOrNull { it.id == id }?.holdsMatter() == true
                if (ComposerSlideDeletion.needsConfirmation(holds)) pendingRemoval = id else onRemove(id)
            }
            SlideTile(
                slide = slide,
                index = index,
                count = deck.size,
                currentIndex = deck.selectedIndex,
                spec = rememberTileSpec(slide, backgrounds[slide.id], accentHex, tileWidth),
                backgroundModel = backgrounds[slide.id]?.model,
                isDragged = dragFrom == index,
                dragPx = dragPx,
                shift = shift,
                onSelect = onSelect,
                onDelete = requestRemoval,
                onMove = onMove,
                onDuplicate = { id -> onSelect(id); onDuplicate() },
                onEditBackground = onEditBackground,
                menuOpen = menuFor == slide.id,
                onMenuDismiss = { menuFor = null },
                onDragStart = { dragFrom = index; dragPx = 0f; lastTarget = index; haptics.medium() },
                onDrag = { dragPx += it },
                onDragEnd = {
                    val to = target
                    dragFrom = NO_DRAG; dragPx = 0f
                    if (to != NO_DRAG && to != index) onMove(slide.id, to) else menuFor = slide.id
                },
                onDragCancel = { dragFrom = NO_DRAG; dragPx = 0f },
            )
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
                heightPx = SlideRailGeometry.TileHeight.roundToPx(),
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
    isDragged: Boolean,
    dragPx: Float,
    shift: Float,
    onSelect: (String) -> Unit,
    onDelete: (String) -> Unit,
    onMove: (String, Int) -> Unit,
    onDuplicate: (String) -> Unit,
    onEditBackground: ((String) -> Unit)?,
    menuOpen: Boolean,
    onMenuDismiss: () -> Unit,
    onDragStart: () -> Unit,
    onDrag: (Float) -> Unit,
    onDragEnd: () -> Unit,
    onDragCancel: () -> Unit,
) {
    val dragStart by rememberUpdatedState(onDragStart)
    val dragBy by rememberUpdatedState(onDrag)
    val dragEnd by rememberUpdatedState(onDragEnd)
    val dragCancel by rememberUpdatedState(onDragCancel)
    val isCurrent = index == currentIndex
    val animatedShift by animateFloatAsState(targetValue = shift, label = "slideTileShift")
    val moveBefore = stringResource(R.string.stories_composer_slide_move_earlier)
    val moveAfter = stringResource(R.string.stories_composer_slide_move_later)
    val duplicateLabel = stringResource(R.string.stories_composer_duplicate_slide)
    val removeLabel = stringResource(R.string.stories_composer_remove_slide)
    val editBackgroundLabel = stringResource(R.string.story_composer_edit_slide_background)
    val canEditBackground = SlideThumbEditAffordance.editableBackgroundId(slide.backgroundMediaId, onEditBackground != null) != null
    val actions = buildList {
        if (index > 0) add(CustomAccessibilityAction(moveBefore) { onMove(slide.id, index - 1); true })
        if (index < count - 1) add(CustomAccessibilityAction(moveAfter) { onMove(slide.id, index + 1); true })
        if (canEditBackground) add(CustomAccessibilityAction(editBackgroundLabel) { onEditBackground?.invoke(slide.id); true })
        add(CustomAccessibilityAction(duplicateLabel) { onDuplicate(slide.id); true })
        if (count > 1) add(CustomAccessibilityAction(removeLabel) { onDelete(slide.id); true })
    }
    SlideRailTile(
        position = stringResource(R.string.composer_slide_rail_position, index + 1, count),
        deleteLabel = stringResource(R.string.composer_slide_rail_delete, index + 1),
        isCurrent = isCurrent,
        navigates = ComposerHeaderTiles.tilesNavigate(count),
        showsBin = ComposerHeaderTiles.showsDelete(sceneIndex = index, currentIndex = currentIndex, sceneCount = count),
        onSelect = { onSelect(slide.id) },
        onDelete = { onDelete(slide.id) },
        modifier = Modifier
            .graphicsLayer {
                translationX = if (isDragged) dragPx else animatedShift
                val lift = if (isDragged) DRAG_LIFT_SCALE else 1f
                scaleX = lift
                scaleY = lift
            }
            .then(if (isDragged) Modifier.shadow(MeeshySpacing.xs, RoundedCornerShape(MeeshyRadius.xxs)) else Modifier),
        tileModifier = Modifier.pointerInput(slide.id) {
            detectDragGesturesAfterLongPress(
                onDragStart = { dragStart() },
                onDrag = { change, amount -> change.consume(); dragBy(amount.x) },
                onDragEnd = { dragEnd() },
                onDragCancel = { dragCancel() },
            )
        },
        actions = actions,
    ) {
        SlideThumbnail(spec = spec, backgroundModel = backgroundModel, modifier = Modifier.fillMaxSize())
        DropdownMenu(expanded = menuOpen, onDismissRequest = onMenuDismiss) {
            if (canEditBackground) DropdownMenuItem(
                text = { Text(editBackgroundLabel) },
                leadingIcon = { Icon(MeeshyIcons.Tune, contentDescription = null) },
                onClick = { onMenuDismiss(); onEditBackground?.invoke(slide.id) },
            )
            DropdownMenuItem(
                text = { Text(duplicateLabel) },
                leadingIcon = { Icon(MeeshyIcons.Copy, contentDescription = null) },
                onClick = { onMenuDismiss(); onDuplicate(slide.id) },
            )
            if (count > 1) DropdownMenuItem(
                text = { Text(removeLabel) },
                leadingIcon = { Icon(MeeshyIcons.Delete, contentDescription = null) },
                onClick = { onMenuDismiss(); onDelete(slide.id) },
            )
        }
    }
}

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
internal fun rememberGuardedAddition(
    canAdd: Boolean,
    @androidx.annotation.StringRes refusalRes: Int = R.string.composer_slide_rail_capReached,
    action: () -> Unit,
): () -> Unit {
    val haptics = rememberMeeshyHaptics()
    val context = LocalContext.current
    val refusal = stringResource(refusalRes)
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
