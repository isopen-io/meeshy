package me.meeshy.app.chat

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import java.io.File
import java.util.UUID

/**
 * Un sticker emoji devient une IMAGE (iOS `ConversationStickerRendering.emojiImage`) : le glyphe peint sur un carré
 * transparent, en PNG. C'est sous cette forme qu'il part, dans un commentaire comme dans une conversation (#14320).
 *
 * La police d'emoji couleur d'Android est une police BITMAP (CBDT) : Skia ne la dessine pas au-delà de
 * [COLOR_EMOJI_MAX_TEXT_SIZE] px et ne laisse alors RIEN (recette S8 : un PNG 512 px vide). Le glyphe se peint donc à
 * [GLYPH_TEXT_SIZE] dans un carré de [DRAW_SIDE], puis l'image s'agrandit à [SIDE].
 */
internal object ComposerEmojiSticker {
    const val MIME: String = "image/png"

    const val COLOR_EMOJI_MAX_TEXT_SIZE: Float = 256f
    const val GLYPH_TEXT_SIZE: Float = 160f

    private const val DRAW_SIDE: Int = 256
    private const val SIDE: Int = 512

    fun render(glyph: String, directory: File): File {
        val drawn = Bitmap.createBitmap(DRAW_SIDE, DRAW_SIDE, Bitmap.Config.ARGB_8888)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = GLYPH_TEXT_SIZE
            textAlign = Paint.Align.CENTER
        }
        val metrics = paint.fontMetrics
        val baseline = DRAW_SIDE / 2f - (metrics.ascent + metrics.descent) / 2f
        Canvas(drawn).drawText(glyph, DRAW_SIDE / 2f, baseline, paint)
        val sticker = Bitmap.createScaledBitmap(drawn, SIDE, SIDE, true)
        val file = File(directory, "sticker-${UUID.randomUUID()}.png")
        file.outputStream().use { sticker.compress(Bitmap.CompressFormat.PNG, 100, it) }
        if (sticker !== drawn) sticker.recycle()
        drawn.recycle()
        return file
    }
}
