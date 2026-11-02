package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import android.graphics.Color
import android.media.MediaMetadataRetriever
import java.io.File
import kotlin.math.max
import me.meeshy.sdk.media.RetouchVideoLook
import me.meeshy.sdk.model.composer.look.ComposerPhotoFrame
import me.meeshy.sdk.model.composer.look.ComposerPhotoLook
import me.meeshy.sdk.model.composer.look.ComposerVideoFrameMatte
import me.meeshy.sdk.model.composer.look.ComposerVideoLook

/**
 * **LE LOOK D'UNE VIDÉO, PRÊT POUR LE GPU** (#12736) — le filtre en matrice de couleur, le cadre peint par le
 * peintre unique ([ComposerLookPainter]) puis troué là où la prise se voit ([ComposerVideoFrameMatte]) : l'aperçu
 * et le rendu reçoivent les mêmes effets ([me.meeshy.sdk.media.RetouchVideoEffects]).
 */
internal object RetouchVideoLookPainter {

    /**
     * Le look à la taille [width] × [height] de la vidéo rendue (recadrage compris) ; [still] (une image de la
     * vidéo, même cadrage) donne les fonds que le cadre tire de la prise. `null` si le cadre ne se peint pas.
     */
    fun paint(look: ComposerPhotoLook, author: ComposerLookAuthor, width: Int, height: Int, still: Bitmap?): RetouchVideoLook? {
        val matrix = ComposerVideoLook.rgbMatrix(look.filter)
        if (look.frame == ComposerPhotoFrame.None) return RetouchVideoLook(rgbMatrix = matrix)
        val framed = ComposerPhotoLook(frame = look.frame)
        val white = painted(solid(width, height, Color.WHITE), framed, author, width, height) ?: return null
        val black = painted(solid(width, height, Color.BLACK), framed, author, width, height) ?: return null
        val background = still?.let { painted(fitted(it, width, height), look, author, width, height) }
        val matte = ComposerVideoFrameMatte.compose(white, black, background, width, height)
        val layer = Bitmap.createBitmap(matte.pixels, width, height, Bitmap.Config.ARGB_8888)
        return RetouchVideoLook(rgbMatrix = matrix, frame = layer, placement = matte.slot?.let(ComposerVideoFrameMatte::placement))
    }

    private fun painted(source: Bitmap, look: ComposerPhotoLook, author: ComposerLookAuthor, width: Int, height: Int): IntArray? {
        val painted = ComposerLookPainter.paint(source, look, author, max(width, height)) ?: return null
        val sized = fitted(painted, width, height)
        return IntArray(width * height).also { sized.getPixels(it, 0, width, 0, 0, width, height) }
    }

    private fun solid(width: Int, height: Int, color: Int): Bitmap =
        Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { it.eraseColor(color) }

    private fun fitted(bitmap: Bitmap, width: Int, height: Int): Bitmap =
        if (bitmap.width == width && bitmap.height == height) bitmap else Bitmap.createScaledBitmap(bitmap, width, height, true)
}

/** Une image de la vidéo, debout, au plus [longSide] de grand côté : la bande des looks et les fonds des cadres. */
internal object RetouchVideoStill {
    fun of(file: File, atMs: Long, longSide: Int): Bitmap? = runCatching {
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(file.absolutePath)
            retriever.getFrameAtTime(atMs * 1000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)?.let { scaledCopy(it, longSide) }
        } finally {
            retriever.release()
        }
    }.getOrNull()
}
