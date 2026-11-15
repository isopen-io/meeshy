package me.meeshy.ui.attachment

import androidx.annotation.StringRes
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.InsertChart
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material.icons.filled.TextSnippet
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import me.meeshy.sdk.model.media.AttachmentKind
import me.meeshy.ui.R
import me.meeshy.ui.theme.hexColor

/**
 * La présentation d'une famille de pièce jointe — glyphe, teinte, libellé court — dérivée UNE fois
 * de [AttachmentKind] (miroir de `AttachmentDisplay` iOS). La table MIME → famille et les teintes
 * restent dans `:core:model`.
 */
@Immutable
public data class AttachmentDisplay(
    val kind: AttachmentKind,
    val icon: ImageVector,
    val tint: Color,
    val hexTintColor: String,
    @StringRes val shortLabel: Int,
) {
    public companion object {
        public fun of(kind: AttachmentKind): AttachmentDisplay = AttachmentDisplay(
            kind = kind,
            icon = iconOf(kind),
            tint = hexColor(kind.hexTintColor),
            hexTintColor = kind.hexTintColor,
            shortLabel = labelOf(kind),
        )

        public fun ofMime(mimeType: String?): AttachmentDisplay = of(AttachmentKind.fromMime(mimeType))

        private fun iconOf(kind: AttachmentKind): ImageVector = when (kind) {
            AttachmentKind.IMAGE -> Icons.Filled.PhotoCamera
            AttachmentKind.VIDEO -> Icons.Filled.Videocam
            AttachmentKind.AUDIO -> Icons.Filled.GraphicEq
            AttachmentKind.PDF -> Icons.Filled.PictureAsPdf
            AttachmentKind.SPREADSHEET -> Icons.Filled.TableChart
            AttachmentKind.DOCUMENT -> Icons.Filled.Description
            AttachmentKind.PRESENTATION -> Icons.Filled.InsertChart
            AttachmentKind.ARCHIVE -> Icons.Filled.Archive
            AttachmentKind.CODE -> Icons.Filled.Code
            AttachmentKind.TEXT -> Icons.Filled.TextSnippet
            AttachmentKind.OTHER -> Icons.Filled.AttachFile
        }

        @StringRes
        private fun labelOf(kind: AttachmentKind): Int = when (kind) {
            AttachmentKind.IMAGE -> R.string.media_label_photo
            AttachmentKind.VIDEO -> R.string.media_label_video
            AttachmentKind.AUDIO -> R.string.media_label_audio
            AttachmentKind.PDF -> R.string.attachment_kind_pdf
            AttachmentKind.SPREADSHEET -> R.string.attachment_kind_excel
            AttachmentKind.DOCUMENT -> R.string.attachment_kind_word
            AttachmentKind.PRESENTATION -> R.string.attachment_kind_powerpoint
            AttachmentKind.ARCHIVE -> R.string.attachment_kind_archive
            AttachmentKind.CODE -> R.string.attachment_kind_code
            AttachmentKind.TEXT -> R.string.attachment_kind_text
            AttachmentKind.OTHER -> R.string.media_label_file
        }
    }
}
