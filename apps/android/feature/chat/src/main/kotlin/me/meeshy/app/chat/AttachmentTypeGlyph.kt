package me.meeshy.app.chat

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.ui.graphics.vector.ImageVector
import me.meeshy.sdk.model.composer.PendingAttachmentType

/** Le glyphe d'un type de pièce, partagé par la tuile prête et la tuile en préparation. */
internal fun PendingAttachmentType.attachmentGlyph(): ImageVector = when (this) {
    PendingAttachmentType.IMAGE -> Icons.Filled.Image
    PendingAttachmentType.VIDEO -> Icons.Filled.Videocam
    PendingAttachmentType.AUDIO -> Icons.Filled.Mic
    PendingAttachmentType.FILE -> Icons.AutoMirrored.Filled.InsertDriveFile
}
