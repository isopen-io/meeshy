package me.meeshy.app.chat

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.composer.capture.CameraResult
import me.meeshy.ui.component.capture.CaptureViewfinder

/**
 * Le viseur plein écran de la barre de conversation (iOS `ComposerCaptureStage` monté sans carte) : un seul
 * déclencheur pour la photo et la vidéo, au lieu de la boîte « photo ou vidéo ? » qui lançait deux applications
 * caméra. Plein écran ⇒ croix (x) et glissé vers le bas pour fermer ; le retour système demande avant d'abandonner.
 *
 * La prise rejoint la retouche existante ([onCaptured]) puis son fichier de cache est supprimé, comme le faisait
 * le chemin à intents. Les affordances de la conversation décident ce que les gestes offrent.
 */
@Composable
internal fun ComposerViewfinderHost(
    canSendImages: Boolean,
    canSendVideos: Boolean,
    onCaptured: suspend (uri: Uri, isVideo: Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    Dialog(
        onDismissRequest = {},
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false, dismissOnClickOutside = false),
    ) {
        CaptureViewfinder(
            onDisarm = onDismiss,
            onDeliver = { result ->
                val (uri, isVideo) = when (result) {
                    is CameraResult.Photo -> Uri.parse(result.uri) to false
                    is CameraResult.Video -> Uri.parse(result.uri) to true
                }
                scope.launch {
                    onCaptured(uri, isVideo)
                    withContext(Dispatchers.IO) { uri.path?.let { runCatching { File(it).delete() } } }
                }
                onDismiss()
            },
            allowsPhoto = canSendImages,
            allowsVideo = canSendVideos,
        )
    }
}
