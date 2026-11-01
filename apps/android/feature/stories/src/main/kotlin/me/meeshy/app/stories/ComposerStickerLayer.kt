package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import me.meeshy.sdk.model.composer.SceneObjectMenu
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.layout.ContentScale
import coil.compose.SubcomposeAsyncImage
import me.meeshy.ui.sticker.StickerTemplateArtwork
import me.meeshy.ui.sticker.stickerTemplateName

/**
 * One on-canvas sticker — emoji, template or image ([ComposerStickerArt]): placed at its normalised ([StoryStickerElement.x],
 * [StoryStickerElement.y]) of the measured canvas (centred on that point), draggable,
 * pinch/rotate-able with one gesture, tappable to select and long-pressable for its menu
 * (vue `1d`) — TalkBack reaches the same menu by its long-click action. Selected, it draws no frame
 * ([sceneSelection], #14207); its actions ride the selection bar, the menu a shortcut of them. Lifting the finger closes the gesture (one undo step). The pointer handlers
 * read the callbacks through [rememberUpdatedState], so a recomposition never leaves a
 * gesture holding a stale canvas size. The normalised→pixel placement and the pixel→normalised
 * drag delta are the only arithmetic here; the clamp lives in the pure [StoryStickerElement].
 */
@Composable
internal fun StickerLayer(
    sticker: StoryStickerElement,
    selected: Boolean,
    menu: SceneObjectContextMenu?,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
    onTap: () -> Unit,
    onLongPress: () -> Unit,
    onMenuAction: (SceneObjectMenu.Action) -> Unit,
    onMenuDismiss: () -> Unit,
    onDrag: (Float, Float) -> Unit,
    onDragEnd: () -> Unit,
    onTransform: (Float, Float) -> Unit,
) {
    var sizePx by remember { mutableStateOf(IntSize.Zero) }
    val label = stickerTemplateName(sticker.templateId) ?: sticker.emoji
    val haptics = rememberMeeshyHaptics()
    val currentTap by rememberUpdatedState(onTap)
    val currentLongPress by rememberUpdatedState(onLongPress)
    val currentDrag by rememberUpdatedState(onDrag)
    val currentDragEnd by rememberUpdatedState(onDragEnd)
    val currentTransform by rememberUpdatedState(onTransform)
    val currentScale by rememberUpdatedState(sticker.scale)
    val currentRotation by rememberUpdatedState(sticker.rotationDeg)
    Box(
        modifier = Modifier
            .offset {
                IntOffset(
                    x = (sticker.x * canvasWidthPx - sizePx.width / 2f).roundToInt(),
                    y = (sticker.y * canvasHeightPx - sizePx.height / 2f).roundToInt(),
                )
            }
            .graphicsLayer {
                scaleX = sticker.scale
                scaleY = sticker.scale
                rotationZ = sticker.rotationDeg
            }
            .onSizeChanged { sizePx = it }
            .sceneObjectGestures(
                key = sticker.id,
                pose = { SceneObjectPose(currentScale, currentRotation) },
                onTap = { currentTap() },
                onLongPress = {
                    haptics.medium()
                    currentLongPress()
                },
                onMove = { pan, zoom, rotation ->
                    currentDrag(pan.x, pan.y)
                    currentTransform(zoom, rotation)
                },
                onEnd = { currentDragEnd() },
            )
            .semantics {
                contentDescription = label
                onClick { currentTap(); true }
                onLongClick { currentLongPress(); true }
            }
            .sceneSelection(selected)
            .padding(4.dp),
        contentAlignment = Alignment.Center,
    ) {
        ComposerStickerArt(sticker, sidePx = StickerArtMetrics.sidePx(canvasWidthPx))
        if (sticker.isAwaitingImage) IncomingStickerRing(Modifier.align(Alignment.BottomEnd))
        SceneObjectMenuPopup(menu = menu, onAction = onMenuAction, onDismiss = onMenuDismiss)
    }
}

/**
 * Ce que le canevas dessine d'un sticker (#13847) : son gabarit s'il est au catalogue, son image (l'aperçu local pendant
 * l'envoi, puis l'adresse servie) avec l'emoji en attendant, sinon l'emoji — dans le carré de [sidePx] que le lecteur
 * lui donnera ([StickerArtMetrics]), son échelle portée par le calque.
 */
@Composable
private fun ComposerStickerArt(sticker: StoryStickerElement, sidePx: Float) {
    val density = LocalDensity.current
    val side = with(density) { sidePx.toDp() }
    val glyph: @Composable () -> Unit = {
        Text(text = sticker.emoji, fontSize = with(density) { (sidePx * StickerArtMetrics.GLYPH_FRACTION).toSp() }, maxLines = 1)
    }
    Box(modifier = Modifier.size(side).testTag(COMPOSER_STICKER_TAG), contentAlignment = Alignment.Center) {
        when {
            StickerTemplateArtwork.knows(sticker.templateId) ->
                StickerTemplateArtwork(sticker.templateId, sticker.slots, body = side * StickerArtMetrics.TEMPLATE_BODY_FRACTION)
            sticker.imageUrl != null -> SubcomposeAsyncImage(
                model = sticker.imageUrl,
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize(),
                loading = { glyph() },
                error = { glyph() },
            )
            else -> glyph()
        }
    }
}

/** Le carré d'un sticker du compositeur, pour les témoins qui mesurent sa taille peinte. */
internal const val COMPOSER_STICKER_TAG = "composer-sticker"
