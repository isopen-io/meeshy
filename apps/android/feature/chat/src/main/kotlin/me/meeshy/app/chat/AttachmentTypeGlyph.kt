package me.meeshy.app.chat

import androidx.compose.ui.graphics.vector.ImageVector
import me.meeshy.sdk.model.composer.PendingAttachmentType
import me.meeshy.ui.icons.MeeshyIcons

/** Le glyphe d'un type de pièce, partagé par la tuile prête et la tuile en préparation. */
internal fun PendingAttachmentType.attachmentGlyph(): ImageVector = when (this) {
    PendingAttachmentType.IMAGE -> MeeshyIcons.PhotoFilled
    PendingAttachmentType.VIDEO -> MeeshyIcons.Video
    PendingAttachmentType.AUDIO -> MeeshyIcons.Mic
    PendingAttachmentType.FILE -> MeeshyIcons.InsertFile
}
