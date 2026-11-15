package me.meeshy.app.chat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import coil.compose.AsyncImage
import coil.request.ImageRequest
import coil.size.Size
import java.io.File
import me.meeshy.sdk.model.composer.PendingAttachment

private val QuickLookSide = 280.dp
private const val DECODE_PX = 840

/**
 * L'aperçu rapide d'un appui long — 280×280, l'image décodée à 840 px à la demande (jamais au rendu de la
 * tuile). Sans image à montrer, le glyphe du type. La vidéo montre sa vignette (lecture en boucle : suite).
 */
@Composable
internal fun AttachmentQuickLookPreview(item: PendingAttachment, accent: Color, onDismiss: () -> Unit) {
    val path = item.thumbnailPath ?: item.localPath.takeIf { item.type == me.meeshy.sdk.model.composer.PendingAttachmentType.IMAGE }
    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier.size(QuickLookSide).clip(RoundedCornerShape(16.dp)),
            contentAlignment = Alignment.Center,
        ) {
            if (path != null) {
                AsyncImage(
                    model = ImageRequest.Builder(LocalContext.current).data(File(path)).size(Size(DECODE_PX, DECODE_PX)).build(),
                    contentDescription = item.fileName,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(QuickLookSide),
                )
            } else {
                Icon(item.type.attachmentGlyph(), contentDescription = item.fileName, tint = accent, modifier = Modifier.size(64.dp))
            }
        }
    }
}
