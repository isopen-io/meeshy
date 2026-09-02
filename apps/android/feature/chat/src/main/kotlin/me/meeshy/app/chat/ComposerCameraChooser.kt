package me.meeshy.app.chat

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R

/**
 * The composer drawer's Camera tile chooser (issue #3738). [ComposerAttachmentLadder]
 * offers a single combined Camera tile — mirroring [AttachmentTileKind.Camera]
 * riding the *capture* capability (`canSendImages` OR `canSendVideos`) rather than
 * two separate kinds — so tapping it asks which capture to launch before either
 * system camera activity (`ACTION_IMAGE_CAPTURE` / `ACTION_VIDEO_CAPTURE`, wired by
 * [rememberChatCameraCapture]) actually opens.
 *
 * The dialog only offers the modes [canSendImages]/[canSendVideos] actually allow —
 * `ComposerSendGate` already refuses the send client-side either way, so this is
 * about the nominal path (dimension 7: chemin nominal ≤ 2 gestes), not a security
 * boundary: without it a participant limited to one mode could still open the
 * system camera for the other, only to have the send silently dropped. When only
 * one mode is permitted, that capture launches directly instead of asking.
 */
@Composable
internal fun ComposerCameraChooser(
    canSendImages: Boolean,
    canSendVideos: Boolean,
    onPickPhoto: () -> Unit,
    onPickVideo: () -> Unit,
    onDismiss: () -> Unit,
) {
    if (canSendImages && !canSendVideos) {
        LaunchedEffect(Unit) { onDismiss(); onPickPhoto() }
        return
    }
    if (canSendVideos && !canSendImages) {
        LaunchedEffect(Unit) { onDismiss(); onPickVideo() }
        return
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.chat_camera_chooser_title)) },
        confirmButton = {
            if (canSendImages) {
                TextButton(onClick = { onDismiss(); onPickPhoto() }) {
                    Icon(Icons.Filled.PhotoCamera, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.chat_camera_chooser_photo))
                }
            }
        },
        dismissButton = {
            if (canSendVideos) {
                TextButton(onClick = { onDismiss(); onPickVideo() }) {
                    Icon(Icons.Filled.Videocam, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.chat_camera_chooser_video))
                }
            }
        },
    )
}
