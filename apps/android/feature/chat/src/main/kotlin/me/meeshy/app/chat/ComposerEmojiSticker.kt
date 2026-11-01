package me.meeshy.app.chat

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import java.io.File
import java.util.UUID

/**
 * Un sticker emoji devient une IMAGE (iOS `ConversationStickerRendering.emojiImage`) : le glyphe peint sur un carré
 * transparent, en PNG. C'est sous cette forme qu'il part, dans un commentaire comme dans une conversation (#14320).
 */
internal object ComposerEmojiSticker {
    const val MIME: String = "image/png"

    private const val SIDE: Int = 512
    private const val GLYPH_RATIO: Float = 0.8f

    fun render(glyph: String, directory: File): File {
        val bitmap = Bitmap.createBitmap(SIDE, SIDE, Bitmap.Config.ARGB_8888)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = SIDE * GLYPH_RATIO
            textAlign = Paint.Align.CENTER
        }
        val metrics = paint.fontMetrics
        val baseline = SIDE / 2f - (metrics.ascent + metrics.descent) / 2f
        Canvas(bitmap).drawText(glyph, SIDE / 2f, baseline, paint)
        val file = File(directory, "sticker-${UUID.randomUUID()}.png")
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
        return file
    }
}
