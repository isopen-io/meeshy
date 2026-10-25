package me.meeshy.app.chat

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.composer.PendingAttachment
import me.meeshy.sdk.model.composer.PendingAttachmentType

/**
 * **TOUCHER UNE PIÈCE EN ATTENTE L'OUVRE DANS LA RETOUCHE UNIQUE** (#12735) — miroir de `ConversationPieceRetouch`
 * iOS : une photo s'ouvre dans [ChatCaptureRetouchHost], une vidéo dans [ChatVideoRetouchHost] ; « Terminé »
 * remplace la pièce à sa place, intouchée rien ne change. Rend le geste « Éditer » du bandeau.
 */
@Composable
internal fun rememberPendingRetouch(actions: ChatHostActions): (PendingAttachment) -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var photo by remember { mutableStateOf<Pair<String, ChatRetouchPending>?>(null) }
    var video by remember { mutableStateOf<Pair<String, ChatVideoRetouchPending>?>(null) }
    photo?.let { (id, piece) ->
        ChatCaptureRetouchHost(
            pending = piece,
            person = actions.selfAuthor(),
            onDeliver = { file ->
                if (file.bytes !== piece.bytes) actions.replacePendingAttachment(id, file.bytes, file.fileName, file.mimeType)
                photo = null
            },
            onDismiss = { photo = null },
        )
    }
    video?.let { (id, piece) ->
        ChatVideoRetouchHost(
            pending = piece,
            onDeliver = { file ->
                video = null
                val rendered = file != piece.source
                withContext(Dispatchers.IO) { if (rendered) piece.source.delete() else piece.discard() }
                if (rendered) actions.replacePendingVideo(id, file)
            },
            onDismiss = {
                piece.discard()
                video = null
            },
        )
    }
    return { item ->
        scope.launch {
            when (item.type) {
                PendingAttachmentType.VIDEO -> item.localPath?.let { path ->
                    ChatVideoRetouchPending.of(context, Uri.fromFile(File(path)), System.currentTimeMillis())?.let { video = item.id to it }
                }
                else -> {
                    val bytes = actions.readPendingBytes(item) ?: return@launch
                    val piece = withContext(Dispatchers.Default) { ChatRetouchPending.of(bytes, item.fileName ?: "photo.jpg", item.mimeType) }
                    if (piece != null) photo = item.id to piece
                }
            }
        }
    }
}
