package me.meeshy.app.chat

import android.media.MediaPlayer
import android.widget.VideoView
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import java.io.File
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.composer.PendingAttachment
import me.meeshy.sdk.model.composer.PendingAttachmentType
import me.meeshy.ui.component.viewer.ViewerDialog
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshySpacing

/**
 * **L'APERÇU PLEIN ÉCRAN D'UNE PIÈCE EN ATTENTE** (appui long, ou toucher quand rien ne s'édite) : l'image se
 * zoome, la vidéo est lue, un son est joué ; « Supprimer » retire la pièce. Le lecteur est relâché dès que
 * l'aperçu quitte l'écran — retirer la pièce coupe donc la lecture d'un vocal en attente.
 */
@Composable
internal fun ComposerAttachmentPreview(
    item: PendingAttachment,
    onDismiss: () -> Unit,
    onDelete: () -> Unit,
) {
    val path = item.localPath ?: return
    ViewerDialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(MeeshyMediaChromeColors.MediaBackdrop)) {
            when (item.type) {
                PendingAttachmentType.IMAGE -> ZoomableFile(path)
                PendingAttachmentType.VIDEO -> VideoFile(path)
                PendingAttachmentType.AUDIO -> AudioFile(path)
                PendingAttachmentType.FILE -> Text(
                    text = item.fileName.orEmpty(),
                    color = MeeshyMediaChromeColors.OnMedia,
                    modifier = Modifier.align(Alignment.Center),
                )
            }
            TextButton(onClick = onDismiss, modifier = Modifier.align(Alignment.TopStart).padding(MeeshySpacing.md)) {
                Text(stringResource(R.string.chat_delete_confirm_cancel), color = MeeshyMediaChromeColors.OnMedia)
            }
            TextButton(onClick = onDelete, modifier = Modifier.align(Alignment.BottomCenter).padding(MeeshySpacing.lg)) {
                Text(stringResource(R.string.piece_action_delete), color = MeeshyMediaChromeColors.OnMedia)
            }
        }
    }
}

@Composable
private fun ZoomableFile(path: String) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }
    val state = rememberTransformableState { zoom, pan, _ ->
        scale = (scale * zoom).coerceIn(1f, 5f)
        offsetX = if (scale > 1f) offsetX + pan.x else 0f
        offsetY = if (scale > 1f) offsetY + pan.y else 0f
    }
    AsyncImage(
        model = File(path),
        contentDescription = null,
        contentScale = ContentScale.Fit,
        modifier = Modifier
            .fillMaxSize()
            .transformable(state)
            .graphicsLayer { scaleX = scale; scaleY = scale; translationX = offsetX; translationY = offsetY },
    )
}

@Composable
private fun VideoFile(path: String) {
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
            VideoView(context).apply {
                setVideoPath(path)
                setOnPreparedListener { it.isLooping = true; start() }
            }
        },
        onRelease = { it.stopPlayback() },
    )
}

@Composable
private fun AudioFile(path: String) {
    DisposableEffect(path) {
        val player = runCatching {
            MediaPlayer().apply {
                setDataSource(path)
                setOnPreparedListener { it.start() }
                prepareAsync()
            }
        }.getOrNull()
        onDispose { runCatching { player?.release() } }
    }
}
