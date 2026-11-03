package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MessageSticker
import kotlin.math.roundToInt

/**
 * La pièce optimiste d'un sticker envoyé : la bulle montre l'image LOCALE avant l'accusé (miroir de
 * `StickerOptimisticAttachment`, iOS). Poids 0 (il naît de l'encodage), dimensions = pixels × échelle, vignette = URL
 * locale ; le texte du sticker (s'il y en a un) devient l'`alt`.
 */
object StickerOptimisticAttachment {

    fun make(
        attachmentId: String,
        mimeType: String,
        localUrl: String,
        widthPx: Int,
        heightPx: Int,
        scale: Float = 1f,
        sticker: MessageSticker?,
        uploadedBy: String,
    ): ApiMessageAttachment {
        val fileName = "sticker_$attachmentId.${extension(mimeType)}"
        return ApiMessageAttachment(
            id = attachmentId,
            fileName = fileName,
            originalName = fileName,
            mimeType = mimeType,
            fileSize = 0,
            fileUrl = localUrl,
            thumbnailUrl = localUrl,
            width = (widthPx * scale).roundToInt(),
            height = (heightPx * scale).roundToInt(),
            uploadedBy = uploadedBy,
            alt = sticker?.let(StickerAltText::describe),
        )
    }

    private fun extension(mimeType: String): String = when (mimeType.lowercase()) {
        "image/png" -> "png"
        "image/webp" -> "webp"
        "image/gif" -> "gif"
        else -> "jpg"
    }
}
