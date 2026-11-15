package me.meeshy.app.chat

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.widget.Toast
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.draganddrop.dragAndDropTarget
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draganddrop.DragAndDropEvent
import androidx.compose.ui.draganddrop.DragAndDropTarget
import androidx.compose.ui.draganddrop.toAndroidDragEvent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.app.ActivityCompat
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.paste.ComposerImportFailure
import me.meeshy.ui.theme.MeeshyRadius

/**
 * La bande du composeur, cible de dépôt (tablette, ChromeOS, multi-fenêtre) : tout fichier déposé est copié dans le
 * cache puis remis à [onPickFile] ; un texte déposé part à [onText]. Pendant le survol, une bordure d'accent en
 * pointillé et « Déposer ici » — sans barrière modale. Désactivée (`enabled = false`) quand l'envoi est interdit.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun Modifier.composerDropTarget(
    enabled: Boolean,
    onPickFile: (file: File, fileName: String, mimeType: String?) -> Unit,
    onText: (String) -> Unit,
    onHoverChange: (Boolean) -> Unit,
): Modifier {
    if (!enabled) return this
    val context = LocalContext.current
    val activity = context.findActivity()
    val scope = rememberCoroutineScope()
    val pick = rememberUpdatedState(onPickFile)
    val text = rememberUpdatedState(onText)
    val hover = rememberUpdatedState(onHoverChange)
    val resolver = remember(context) {
        ComposerDropResolver(context.contentResolver, File(context.cacheDir, "paste"), Dispatchers.IO)
    }
    val target = remember(resolver) {
        object : DragAndDropTarget {
            override fun onEntered(event: DragAndDropEvent) = hover.value(true)
            override fun onExited(event: DragAndDropEvent) = hover.value(false)
            override fun onEnded(event: DragAndDropEvent) = hover.value(false)
            override fun onDrop(event: DragAndDropEvent): Boolean {
                hover.value(false)
                val drag = event.toAndroidDragEvent()
                val clip = drag.clipData ?: return false
                if (clip.itemCount == 0) return false
                activity?.let { ActivityCompat.requestDragAndDropPermissions(it, drag) }
                scope.launch {
                    val outcomes = (0 until clip.itemCount).map { resolver.resolve(clip.getItemAt(it)) }
                    deliver(outcomes, context, pick.value, text.value)
                }
                return true
            }
        }
    }
    return dragAndDropTarget(
        shouldStartDragAndDrop = { event -> event.toAndroidDragEvent().clipDescription != null },
        target = target,
    )
}

private fun deliver(
    outcomes: List<ComposerIngest>,
    context: Context,
    onPickFile: (File, String, String?) -> Unit,
    onText: (String) -> Unit,
) {
    outcomes.filterIsInstance<ComposerIngest.Copied>().forEach { onPickFile(it.file, it.name, it.mime) }
    outcomes.filterIsInstance<ComposerIngest.Text>().forEach { onText(it.text) }
    val failed = outcomes.filterIsInstance<ComposerIngest.Failed>()
    if (failed.isEmpty()) return
    val names = ComposerImportFailure.names(failed.map { it.name }, context.getString(R.string.composer_drop_unnamed_item))
    Toast.makeText(context, context.getString(R.string.composer_drop_import_failed, names), Toast.LENGTH_LONG).show()
}

/** L'indication de survol : bordure d'accent en pointillé et libellé, posée par-dessus la bande sans la bloquer. */
@Composable
internal fun ComposerDropHint(accentColor: Color, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    Box(
        modifier = modifier
            .fillMaxSize()
            .padding(4.dp)
            .dashedBorder(accentColor, shape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = stringResource(R.string.composer_drop_here),
            color = accentColor,
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

private fun Modifier.dashedBorder(color: Color, shape: RoundedCornerShape): Modifier = drawWithContent {
    drawContent()
    val radius = shape.topStart.toPx(androidx.compose.ui.geometry.Size(size.width, size.height), this)
    drawRoundRect(
        color = color,
        cornerRadius = CornerRadius(radius, radius),
        style = Stroke(width = 1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(14f, 10f))),
    )
}

private fun Context.findActivity(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}

/**
 * La bande du composeur : [content] reçoit les dépôts quand [enabled], et l'indication « Déposer ici » s'affiche par-dessus
 * pendant le survol, sans jamais bloquer les gestes en dessous.
 */
@Composable
internal fun ComposerDropBand(
    enabled: Boolean,
    accentColor: Color,
    onPickFile: (file: File, fileName: String, mimeType: String?) -> Unit,
    onText: (String) -> Unit,
    content: @Composable BoxScope.() -> Unit,
) {
    var hovering by remember { mutableStateOf(false) }
    Box(Modifier.composerDropTarget(enabled, onPickFile, onText) { hovering = it }) {
        content()
        if (enabled && hovering) ComposerDropHint(accentColor)
    }
}
