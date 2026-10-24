package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.clickable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.composer.look.CallFaceEffect
import me.meeshy.sdk.model.composer.look.ComposerEditTake
import me.meeshy.sdk.model.composer.look.ComposerLookCanvas
import me.meeshy.sdk.model.composer.look.ComposerLookFamily
import me.meeshy.sdk.model.composer.look.ComposerRetouchDelivery
import me.meeshy.sdk.model.composer.look.ComposerRetouchState
import me.meeshy.ui.R

/** Ce que « Terminé » remet à l'hôte : la prise telle quelle, ou son rendu. */
public sealed interface ComposerRetouchResult {
    public data object Original : ComposerRetouchResult
    public data class Rendered(val bitmap: Bitmap) : ComposerRetouchResult
}

/** Les effets que la retouche Android sait peindre sur une prise : aucun encore (#12614 les suit). */
public val RetouchRenderableEffects: List<CallFaceEffect> = emptyList()

/**
 * **LA RETOUCHE UNIQUE D'UNE PHOTO** (#11133, #12614) — miroir de `ConversationPieceRetouch` (iOS) : la prise
 * remplit l'écran, (x) et « Terminé » en haut tant qu'aucun élément d'édition ne s'affiche, et le rail
 * Filtres · Cadres (· Effets) en bas ; une famille ouverte déroule sa bande, dont la case au centre est choisie.
 * L'aperçu se repeint hors du fil principal ; tant qu'il cuit, l'image d'avant reste — jamais de sablier.
 * « Terminé » rend la prise retouchée ; « Annuler », (x) et le retour système l'abandonnent.
 */
@Composable
public fun ComposerRetouchScreen(
    source: Bitmap,
    author: ComposerLookAuthor,
    onDone: suspend (ComposerRetouchResult) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var state by remember { mutableStateOf(ComposerRetouchState.opening(ComposerEditTake.Photo, RetouchRenderableEffects, tools = emptyList())) }
    var finishing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val previewSource = remember(source) { scaledCopy(source, ComposerLookCanvas.PREVIEW_LONG_SIDE) }
    val thumbSource = remember(source) { scaledCopy(source, ComposerLookCanvas.THUMBNAIL_LONG_SIDE) }
    var preview by remember { mutableStateOf(previewSource) }

    LaunchedEffect(state.look) {
        val look = state.look
        preview = if (look.isUntouched) previewSource
        else withContext(Dispatchers.Default) { ComposerLookPainter.paint(previewSource, look, author, ComposerLookCanvas.PREVIEW_LONG_SIDE) } ?: preview
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
            val result = when (settled.delivery) {
                ComposerRetouchDelivery.ORIGINAL -> ComposerRetouchResult.Original
                ComposerRetouchDelivery.RENDERED -> withContext(Dispatchers.Default) {
                    ComposerLookPainter.paint(source, settled.look, author, ComposerLookCanvas.EXPORT_LONG_SIDE)
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

    BackHandler(enabled = !state.settled) { if (state.openFamily != null) state = state.tappingFamily(state.openFamily!!) else cancel() }

    Box(modifier.fillMaxSize().background(Color.Black).semantics { testTag = "retouch.screen" }) {
        Image(
            bitmap = preview.asImageBitmap(),
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxSize(),
        )
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
            RetouchRail(families = state.families, open = state.openFamily, enabled = !finishing) { family -> state = state.tappingFamily(family) }
        }
    }
}

@Composable
private fun RetouchTopRow(finishing: Boolean, onCancel: () -> Unit, onDone: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val cancel = stringResource(R.string.common_cancel)
        IconButton(onClick = onCancel, modifier = Modifier.size(48.dp).semantics { contentDescription = cancel }) {
            Icon(Icons.Rounded.Close, contentDescription = null, tint = Color.White)
        }
        TextButton(onClick = onDone, enabled = !finishing, modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp)) {
            Text(
                text = stringResource(if (finishing) R.string.retouch_rendering else R.string.common_done),
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
                style = MaterialTheme.typography.titleSmall,
            )
        }
    }
}

@Composable
private fun RetouchRail(families: List<ComposerLookFamily>, open: ComposerLookFamily?, enabled: Boolean, onTap: (ComposerLookFamily) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.Center) {
        families.forEach { family ->
            val name = stringResource(ComposerRetouchCopy.family(family))
            val chosen = family == open
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .sizeIn(minWidth = 72.dp, minHeight = 48.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (chosen) Color.White.copy(alpha = 0.18f) else Color.Transparent)
                    .clickable(enabled = enabled, role = Role.Tab) { onTap(family) }
                    .semantics(mergeDescendants = true) {
                        selected = chosen
                        role = Role.Tab
                    }
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            ) {
                Icon(ComposerRetouchCopy.familyIcon(family), contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
                Text(name, color = Color.White, style = MaterialTheme.typography.labelSmall, modifier = Modifier.width(72.dp), maxLines = 1, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
        }
    }
}

private fun scaledCopy(source: Bitmap, longSide: Int): Bitmap {
    val size = ComposerLookCanvas.fitted(source.width, source.height, longSide) ?: return source
    if (size.width == source.width && size.height == source.height) return source
    return runCatching { Bitmap.createScaledBitmap(source, size.width, size.height, true) }.getOrDefault(source)
}
