package me.meeshy.app.stories

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import coil.compose.AsyncImage
import coil.request.ImageRequest
import coil.size.Size
import kotlin.math.min
import kotlin.math.roundToInt
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.previewModel
import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.scene.ForegroundMediaFrame
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.ui.component.imageedit.sceneLook
import me.meeshy.ui.component.retouch.LocalComposerLookAuthor
import me.meeshy.ui.component.retouch.storyMediaLook

/**
 * Un média posé et de quoi le peindre : sa pose, le modèle d'image (vignette téléversée, ou aperçu local en attente)
 * et son ratio mesuré — `null` tant que le média n'est pas téléversé, peint alors en carré comme chez les lecteurs.
 */
@Immutable
internal data class PlacedMediaFrame(
    val placed: StoryPlacedMedia,
    val model: Any?,
    val aspectRatio: Double? = null,
    val isVideo: Boolean = false,
    val pendingItem: MediaUploadItem? = null,
    /** Le média attend sa file d'envoi, et la scène dit pourquoi (R5 de #13863, #13959) ; `null` : il est envoyé. */
    val pendingPhase: PendingUploadPhase? = null,
    /** Son filtre, son effet et son cadre de l'appel (#13841), peints AVANT son filtre de story ; `null` : aucun. */
    val mediaLook: StoryMediaLook? = null,
) {
    val key: String get() = placed.id

    val isPending: Boolean get() = pendingPhase != null

    /** Le look que le plateau peint : SON filtre à pleine force puis SES réglages, jamais ceux de la scène — le même que lit `SceneLookRecipe.forMedia`. */
    val look: SceneLookRecipe get() = SceneLookRecipe.forStory(placed.filter, 1f, placed.adjustments, isVideo)
}

/**
 * Les médias posés de la slide choisie, dans l'ordre de pose. Un objet devenu fond a quitté la scène ; une copie du même
 * fichier y reste et se peint (#13905).
 */
internal fun StoryComposerUiState.placedMediaFrames(mediaBaseUrl: String?, comparing: String? = null): List<PlacedMediaFrame> {
    val looks = deck.selectedSlide.mediaLooks
    return deck.selectedSlide.placedMedia.map { placed ->
        if (placed.id == comparing) placed.copy(filter = null, adjustments = null) else placed
    }.mapNotNull { placed ->
        val look = looks[placed.mediaId].takeUnless { placed.id == comparing }
        val uploaded = selectedSlideAttachments.firstOrNull { it.id == placed.mediaId }
        val pending = selectedSlidePending.firstOrNull { it.cmid == placed.mediaId }
        when {
            uploaded != null -> {
                val isVideo = uploaded.mimeType.startsWith("video", ignoreCase = true)
                PlacedMediaFrame(
                    placed = placed,
                    model = if (isVideo) uploaded.thumbnailUrl?.let { ComposerMediaAddress.of(it, mediaBaseUrl) } else ComposerMediaAddress.preview(uploaded, mediaBaseUrl),
                    aspectRatio = ForegroundMediaFrame.measuredAspectRatio(uploaded.width, uploaded.height)
                        ?.let { measured -> StoryMediaCrop.effectiveRatio(measured, placed.crop.takeUnless { isVideo }) },
                    isVideo = isVideo,
                    mediaLook = look,
                )
            }
            pending != null -> {
                val isVideo = pending.item.mimeType.startsWith("video", ignoreCase = true)
                PlacedMediaFrame(
                    placed = placed,
                    model = if (isVideo) null else pending.item.previewModel,
                    isVideo = isVideo,
                    pendingItem = pending.item.takeUnless { isVideo },
                    pendingPhase = pendingPhase(pending.cmid),
                    mediaLook = look,
                )
            }
            else -> null
        }
    }
}

/** Les gestes d'un média posé, par identifiant : glisser (fractions du canevas), fin de geste, pincer / tourner, toucher pour le sélectionner (#13836). */
internal class PlacedMediaGestures(
    val onDrag: (String, Float, Float) -> Unit,
    val onDragEnd: () -> Unit,
    val onTransform: (String, Float, Float) -> Unit,
    val onTap: (String) -> Unit = {},
)

/**
 * Un média de premier plan sur la scène : posé à sa position normalisée (centré sur ce point), glissé, pincé et
 * pivoté d'un seul geste, comme un sticker. Son cadre de base est celui que peignent les lecteurs iOS et Android
 * ([ForegroundMediaFrame], projeté sur la largeur du canevas), rempli comme eux. L'image est décodée hors du fil
 * principal par Coil, à la taille de ce cadre — jamais pleine résolution. Touché, il est sélectionné et porte le cadre de
 * la sélection ([selected], #13836).
 */
@Composable
internal fun PlacedMediaLayer(
    frame: PlacedMediaFrame,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
    gestures: PlacedMediaGestures,
    selected: Boolean = false,
    live: ComposerLiveSlot? = null,
) {
    val placed = frame.placed
    val currentTap by rememberUpdatedState(gestures.onTap)
    val label = stringResource(R.string.composer_selection_placed_media)
    val currentDrag by rememberUpdatedState(gestures.onDrag)
    val currentDragEnd by rememberUpdatedState(gestures.onDragEnd)
    val currentTransform by rememberUpdatedState(gestures.onTransform)
    val currentScale by rememberUpdatedState(placed.scale)
    val currentRotation by rememberUpdatedState(placed.rotationDeg)
    val context = LocalContext.current
    val density = LocalDensity.current
    val measuredRatio by produceState<Double?>(initialValue = null, frame.pendingItem) {
        value = frame.pendingItem?.let { PendingPlacedMediaRatio.of(it) }
    }
    val ratio = frame.aspectRatio ?: measuredRatio
    val base = remember(ratio, canvasWidthPx) {
        ForegroundMediaFrame.renderedSize(ratio, scale = 1.0, canvasWidth = canvasWidthPx.toDouble())
    }
    val widthPx = base.width.toFloat()
    val heightPx = base.height.toFloat()
    val crop = placed.crop.takeUnless { frame.isVideo }
    val author = LocalComposerLookAuthor.current
    val request = remember(frame.model, widthPx, heightPx, crop, frame.mediaLook, author) {
        val (decodeWidth, decodeHeight) = croppedDecodeSize(widthPx, heightPx, crop)
        ImageRequest.Builder(context)
            .data(frame.model)
            .size(Size(decodeWidth, decodeHeight))
            .crossfade(false)
            .storyMediaLook(frame.mediaLook.takeUnless { frame.isVideo }, author)
            .build()
    }
    val corner = with(density) { (min(widthPx, heightPx) * CORNER_FRACTION).toDp() }
    Box(
        modifier = Modifier
            .offset {
                IntOffset(
                    x = (placed.x * canvasWidthPx - widthPx / 2f).roundToInt(),
                    y = (placed.y * canvasHeightPx - heightPx / 2f).roundToInt(),
                )
            }
            .graphicsLayer {
                scaleX = placed.scale
                scaleY = placed.scale
                rotationZ = placed.rotationDeg
            }
            .testTag("placed-media")
            .sceneSelectionFrame(selected, placed.scale)
            .pointerInput(frame.key) { detectTapGestures(onTap = { currentTap(frame.key) }) }
            .semantics {
                contentDescription = label
                onClick { currentTap(frame.key); true }
            }
            .pointerInput(frame.key) {
                detectTransformGestures { _, pan, zoom, rotation ->
                    if (canvasWidthPx > 0f && canvasHeightPx > 0f) {
                        val onCanvas = PlacedMediaPan.toCanvas(pan, currentScale, currentRotation)
                        currentDrag(frame.key, onCanvas.x / canvasWidthPx, onCanvas.y / canvasHeightPx)
                    }
                    currentTransform(frame.key, zoom, rotation)
                }
            }
            .pointerInput(frame.key) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    do {
                        val event = awaitPointerEvent(PointerEventPass.Final)
                    } while (event.changes.any { it.pressed })
                    currentDragEnd()
                }
            },
    ) {
        val frameModifier = Modifier
            .size(with(density) { widthPx.toDp() }, with(density) { heightPx.toDp() })
            .clip(RoundedCornerShape(corner))
        if (frame.model == null && frame.isVideo) {
            VideoFramePlaceholder(frameModifier)
        } else {
            Box(frameModifier) {
                AsyncImage(
                    model = request,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.croppedSource(crop).sceneLook(frame.look),
                )
            }
        }
        // La vidéo posée sélectionnée joue dans son cadre, sous son look (#13973, A-E3).
        live?.let { slot -> Box(frameModifier) { slot.Picture(fit = false, modifier = Modifier.matchParentSize().sceneLook(frame.look)) } }
        frame.pendingPhase?.let { phase -> IncomingWaitingBadge(phase, Modifier.align(Alignment.BottomStart).padding(WAITING_INSET)) }
    }
}

/** Une vidéo dont on n'a aucune image à décoder : un cadre à la forme de la vidéo, jamais un calque vide qu'on ne saisit pas. */
@Composable
private fun VideoFramePlaceholder(modifier: Modifier) {
    Box(
        modifier = modifier
            .testTag("placed-media-placeholder")
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = MeeshyIcons.Video,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(PLACEHOLDER_ICON),
        )
    }
}

private val PLACEHOLDER_ICON = 32.dp
private val WAITING_INSET = 6.dp

/** L'arrondi d'un média posé, en fraction de son petit côté — `StoryMediaLayer.cornerRadiusFraction` (iOS). */
private const val CORNER_FRACTION = 0.06f
