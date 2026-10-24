package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.composer.look.CallFaceEffect
import me.meeshy.sdk.model.composer.look.ComposerCropPreset
import me.meeshy.sdk.model.composer.look.ComposerEditTake
import me.meeshy.sdk.model.composer.look.ComposerEditTool
import me.meeshy.sdk.model.composer.look.ComposerEditTools
import me.meeshy.sdk.model.composer.look.ComposerLookCanvas
import me.meeshy.sdk.model.composer.look.ComposerRetouchDelivery
import me.meeshy.sdk.model.composer.look.ComposerRetouchState
import me.meeshy.sdk.model.composer.look.ComposerRetouchTextBoard
import java.util.UUID

/** Ce que « Terminé » remet à l'hôte : la prise telle quelle, ou son rendu. */
public sealed interface ComposerRetouchResult {
    public data object Original : ComposerRetouchResult
    public data class Rendered(val bitmap: Bitmap) : ComposerRetouchResult
}

/** Les effets que la retouche Android sait peindre sur une prise : aucun encore (#12614 les suit). */
public val RetouchRenderableEffects: List<CallFaceEffect> = emptyList()

/** Les outils de la retouche d'une photo sur Android : Recadrer et Texte. */
public val RetouchPhotoTools: List<ComposerEditTool> = listOf(ComposerEditTool.CROP, ComposerEditTool.TEXT)

/**
 * **LA RETOUCHE UNIQUE D'UNE PHOTO** (#11133, #12614) — miroir de `ConversationPieceRetouch` (iOS) : la prise
 * remplit l'écran, (x) et « Terminé » en haut tant qu'aucun élément d'édition ne s'affiche, et le rail
 * Filtres · Cadres · Recadrer en bas ; une famille ouverte déroule sa bande, dont la case au centre est
 * choisie ; Recadrer pose ses équerres sur la prise entière et ses proportions par presets sous la scène.
 * L'aperçu se repeint hors du fil principal ; tant qu'il cuit, l'image d'avant reste — jamais de sablier.
 */
@Composable
public fun ComposerRetouchScreen(
    source: Bitmap,
    author: ComposerLookAuthor,
    onDone: suspend (ComposerRetouchResult) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var state by remember { mutableStateOf(ComposerRetouchState.opening(ComposerEditTake.Photo, RetouchRenderableEffects, RetouchPhotoTools)) }
    var finishing by remember { mutableStateOf(false) }
    var lockedPreset by remember { mutableStateOf<ComposerCropPreset?>(null) }
    var text by remember { mutableStateOf(ComposerRetouchTextBoard()) }
    val newTextId = { UUID.randomUUID().toString() }
    val scope = rememberCoroutineScope()
    val previewSource = remember(source) { scaledCopy(source, ComposerLookCanvas.PREVIEW_LONG_SIDE) }
    val thumbSource = remember(source) { scaledCopy(source, ComposerLookCanvas.THUMBNAIL_LONG_SIDE) }
    var preview by remember { mutableStateOf(previewSource) }
    val cropping = ComposerEditTools.showsBrackets(state.activeTools)
    val writing = ComposerEditTool.TEXT in state.activeTools && state.openFamily == null
    val previewCrop = if (cropping) null else state.crop

    val previewLook = if (cropping) state.look.withoutFrame else state.look

    LaunchedEffect(previewLook, previewCrop) {
        val look = previewLook
        preview = if (look.isUntouched && previewCrop == null) previewSource
        else withContext(Dispatchers.Default) {
            ComposerLookPainter.paint(previewSource, look, author, ComposerLookCanvas.PREVIEW_LONG_SIDE, previewCrop)
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
                withContext(Dispatchers.Default) {
                    ComposerLookPainter.paint(source, settled.look, author, ComposerLookCanvas.EXPORT_LONG_SIDE, settled.crop)
                        ?.let { RetouchTextPainter.composited(it, written) }
                }?.let { ComposerRetouchResult.Rendered(it) }
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
            Image(preview.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
            val display = with(LocalDensity.current) { ComposerLookCanvas.displayRect(maxWidth.toPx(), maxHeight.toPx(), preview.width, preview.height) }
            if (!cropping) RetouchTextLayer(board = text, display = display, interactive = writing && !finishing, newId = newTextId, onBoard = { text = it })
            if (cropping) {
                RetouchCropBrackets(
                    crop = state.crop,
                    aspect = lockedPreset?.aspect(source.width.toDouble(), source.height.toDouble()),
                    display = display,
                    onCrop = { crop -> state = state.cropping(crop, source.width, source.height) },
                )
            }
        }
        if (state.showsTopRow || finishing) {
            RetouchTopRow(finishing = finishing, onCancel = ::cancel, onDone = ::done, modifier = Modifier.align(Alignment.TopCenter))
        }
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(bottom = 12.dp)) {
            state.openFamily?.let { family ->
                ComposerLookStrip(
                    family = family,
                    look = state.look,
                    thumbSource = thumbSource,
                    author = author,
                    selects = !finishing,
                    onChoose = { item -> state = state.choosing(item) },
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

internal fun scaledCopy(source: Bitmap, longSide: Int): Bitmap {
    val size = ComposerLookCanvas.fitted(source.width, source.height, longSide) ?: return source
    if (size.width == source.width && size.height == source.height) return source
    return runCatching { Bitmap.createScaledBitmap(source, size.width, size.height, true) }.getOrDefault(source)
}
