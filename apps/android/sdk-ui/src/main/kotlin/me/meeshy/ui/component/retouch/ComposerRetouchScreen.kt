package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.composer.look.CallFaceEffect
import me.meeshy.sdk.model.composer.look.CallFaceLandmarks
import me.meeshy.sdk.model.composer.look.ComposerCropPreset
import me.meeshy.sdk.model.composer.look.ComposerEditTake
import me.meeshy.sdk.model.composer.look.ComposerEditTool
import me.meeshy.sdk.model.composer.look.ComposerEditTools
import me.meeshy.sdk.model.composer.look.ComposerLookCanvas
import me.meeshy.sdk.model.composer.look.ComposerPhotoRecipe
import me.meeshy.sdk.model.composer.look.ComposerRetouchDelivery
import me.meeshy.sdk.model.composer.look.ComposerRetouchState
import me.meeshy.sdk.model.composer.look.ComposerRetouchTextBoard
import me.meeshy.sdk.model.composer.look.recipe
import me.meeshy.sdk.model.composer.look.restoring
import me.meeshy.sdk.model.imageedit.CropRect
import java.util.UUID

/**
 * Ce que « Terminé » remet à l'hôte : la prise telle quelle, ou son rendu et la recette qui le peint — l'hôte la garde à
 * côté de l'original pour rouvrir la retouche modifiable (#14844).
 */
public sealed interface ComposerRetouchResult {
    public data object Original : ComposerRetouchResult
    public data class Rendered(val bitmap: Bitmap, val recipe: ComposerPhotoRecipe = ComposerPhotoRecipe()) : ComposerRetouchResult
}

/** Les effets que la retouche Android sait peindre sur une photo (#12733) : ceux de l'appel, dans son ordre. */
public val RetouchRenderableEffects: List<CallFaceEffect> =
    listOf(CallFaceEffect.SMOOTHING, CallFaceEffect.TOAD, CallFaceEffect.ANGEL, CallFaceEffect.DEMON, CallFaceEffect.VOLCANO)

/** Les outils de la retouche d'une photo sur Android : Recadrer et Texte. */
public val RetouchPhotoTools: List<ComposerEditTool> = listOf(ComposerEditTool.CROP, ComposerEditTool.TEXT)

/**
 * **LA RETOUCHE UNIQUE D'UNE PHOTO** (#11133, #12614) — miroir de `ConversationPieceRetouch` (iOS) : la prise
 * remplit l'écran, (x) et « Terminé » en haut tant qu'aucun élément d'édition ne s'affiche, et le rail
 * Filtres · Effets · Cadres · Recadrer en bas ; une famille ouverte déroule sa bande, dont la case au centre est
 * choisie ; Recadrer garde la photo en grand sous un cadre fixe que le pincement et le glisser placent, ses angles
 * saisissables et ses proportions par presets posées par-dessus (#15194).
 * L'aperçu se repeint hors du fil principal ; tant qu'il cuit, l'image d'avant reste — jamais de sablier. Rouverte
 * sur une recette ([initial], #14844), elle rend son look, son recadrage et ses textes, modifiables.
 */
@Composable
public fun ComposerRetouchScreen(
    source: Bitmap,
    author: ComposerLookAuthor,
    onDone: suspend (ComposerRetouchResult) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
    initial: ComposerPhotoRecipe? = null,
) {
    var state by remember {
        val opening = ComposerRetouchState.opening(ComposerEditTake.Photo, RetouchRenderableEffects, RetouchPhotoTools)
        mutableStateOf(initial?.let(opening::restoring) ?: opening)
    }
    var finishing by remember { mutableStateOf(false) }
    var lockedPreset by remember { mutableStateOf(initial?.cropPreset) }
    var text by remember { mutableStateOf(ComposerRetouchTextBoard(texts = initial?.texts.orEmpty())) }
    val newTextId = { UUID.randomUUID().toString() }
    val scope = rememberCoroutineScope()
    val paintContext = LocalRetouchPaintContext.current
    val previewSource = remember(source) { scaledCopy(source, ComposerLookCanvas.PREVIEW_LONG_SIDE) }
    val thumbSource = remember(source) { scaledCopy(source, ComposerLookCanvas.THUMBNAIL_LONG_SIDE) }
    var preview by remember { mutableStateOf(previewSource) }
    val face by produceState<CallFaceLandmarks?>(null, source) { value = withContext(paintContext) { RetouchFaceDetector.detect(previewSource) } }
    val cropping = ComposerEditTools.showsBrackets(state.activeTools)
    val writing = ComposerEditTool.TEXT in state.activeTools && state.openFamily == null
    val previewCrop = if (cropping) null else state.crop
    var controlsHeight by remember { mutableIntStateOf(0) }
    val statusTop = WindowInsets.statusBars.getTop(LocalDensity.current).toFloat()

    val glass by produceState<Bitmap?>(null, preview, text.fingerprint) {
        if (!RetouchGlassPainter.hasGlass(text.texts)) {
            value = null
            return@produceState
        }
        delay(RetouchGlassPainter.SETTLE_MILLIS)
        value = withContext(paintContext) { RetouchGlassPainter.panes(preview, text.texts) }
    }
    val previewLook = if (cropping) state.look.withoutFrame else state.look

    LaunchedEffect(previewLook, previewCrop, face) {
        val look = previewLook
        preview = if (look.isUntouched && previewCrop == null) previewSource
        else withContext(paintContext) {
            ComposerLookPainter.paint(previewSource, look, author, ComposerLookCanvas.PREVIEW_LONG_SIDE, previewCrop, face)
        } ?: preview
    }

    fun cancel() {
        state.settling()?.let { settled ->
            state = settled
            onCancel()
        }
    }

    fun done() {
        val settled = state.settling() ?: return
        state = settled
        finishing = true
        scope.launch {
            val written = text.endingTyping().written
            val result = if (settled.delivery == ComposerRetouchDelivery.ORIGINAL && written.isEmpty()) {
                ComposerRetouchResult.Original
            } else {
                withContext(paintContext) {
                    ComposerLookPainter.paint(source, settled.look, author, ComposerLookCanvas.EXPORT_LONG_SIDE, settled.crop, face)
                        ?.let { RetouchTextPainter.composited(it, written) }
                }?.let { ComposerRetouchResult.Rendered(it, settled.recipe(written)) }
            }
            if (result == null) {
                state = settled.copy(settled = false)
                finishing = false
                return@launch
            }
            onDone(result)
        }
    }

    BackHandler(enabled = !state.settled) {
        val open = state.openFamily
        when {
            open != null -> state = state.tappingFamily(open)
            text.typingId != null -> text = text.endingTyping()
            writing -> state = state.tappingTool(ComposerEditTool.TEXT)
            cropping -> state = state.tappingTool(ComposerEditTool.CROP)
            else -> cancel()
        }
    }

    Box(modifier.fillMaxSize().background(Color.Black).semantics { testTag = "retouch.screen" }) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            if (cropping) {
                RetouchCropStage(
                    picture = preview.asImageBitmap(),
                    crop = state.crop,
                    aspect = lockedPreset?.aspect(source.width.toDouble(), source.height.toDouble()),
                    source = IntSize(source.width, source.height),
                    room = with(LocalDensity.current) { cropRoom(maxWidth.toPx(), maxHeight.toPx(), statusTop, controlsHeight.toFloat()) },
                    onCrop = { crop -> state = state.cropping(crop, source.width, source.height) },
                )
            } else {
                Image(preview.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
                val display = with(LocalDensity.current) { ComposerLookCanvas.displayRect(maxWidth.toPx(), maxHeight.toPx(), preview.width, preview.height) }
                RetouchTextLayer(board = text, display = display, interactive = writing && !finishing, newId = newTextId, onBoard = { text = it }, glass = glass)
            }
        }
        if (state.showsTopRow || finishing) {
            RetouchTopRow(finishing = finishing, onCancel = ::cancel, onDone = ::done, modifier = Modifier.align(Alignment.TopCenter))
        }
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().onSizeChanged { controlsHeight = it.height }.navigationBarsPadding().padding(bottom = 12.dp)) {
            state.openFamily?.let { family ->
                ComposerLookStrip(
                    family = family,
                    look = state.look,
                    thumbSource = thumbSource,
                    author = author,
                    selects = !finishing,
                    onChoose = { item -> state = state.choosing(item) },
                    face = face,
                )
            }
            if (writing) RetouchTextToolbar(board = text, newId = newTextId, onBoard = { text = it })
            if (cropping && state.openFamily == null) {
                RetouchCropPresets(chosen = state.cropPreset, enabled = !finishing) { preset ->
                    lockedPreset = preset
                    state = state.choosingPreset(preset, source.width, source.height)
                }
            }
            RetouchRail(
                state = state,
                enabled = !finishing,
                onFamily = { family -> state = state.tappingFamily(family) },
                onTool = { tool ->
                    state = state.tappingTool(tool)
                    text = if (ComposerEditTool.TEXT in state.activeTools) text.begin(newTextId()) else text.endingTyping()
                },
            )
        }
    }
}

/** La place du cadre en recadrage : sous la barre d'état, au-dessus des préréglages et du rail, posés par-dessus la photo. */
internal fun cropRoom(width: Float, height: Float, top: Float, controls: Float): CropRect {
    val bottom = (height - controls).coerceAtLeast(top)
    return CropRect(0f, top, width, bottom - top)
}

internal fun scaledCopy(source: Bitmap, longSide: Int): Bitmap {
    val size = ComposerLookCanvas.fitted(source.width, source.height, longSide) ?: return source
    if (size.width == source.width && size.height == source.height) return source
    return runCatching { Bitmap.createScaledBitmap(source, size.width, size.height, true) }.getOrDefault(source)
}
