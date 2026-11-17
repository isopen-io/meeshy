package me.meeshy.ui.component.kit

import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

/** Les modules d'un QR : une matrice carrée, `true` pour un module sombre, sans zone de silence (la carte la pose). */
public class MeeshyQrMatrix internal constructor(public val size: Int, public val rows: List<BooleanArray>) {
    public operator fun get(x: Int, y: Int): Boolean = x in 0 until size && y in 0 until size && rows[y][x]
}

/**
 * **L'UNIQUE générateur de QR du kit** (K31) : le contenu entre, une matrice de modules sort, que `MeeshyCodeCard` dessine.
 * Correction « H » (le centre de la carte peut porter une pastille), aucune marge. Aucun autre site n'encode un QR pour la carte.
 */
public object MeeshyQrModules {
    /** La matrice du [content], ou `null` s'il est vide ou trop long pour un QR. */
    public fun encode(content: String): MeeshyQrMatrix? {
        if (content.isEmpty()) return null
        val hints = mapOf(EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.H, EncodeHintType.MARGIN to 0)
        return runCatching {
            val bits = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, 0, 0, hints)
            MeeshyQrMatrix(bits.width, List(bits.height) { y -> BooleanArray(bits.width) { x -> bits[x, y] } })
        }.getOrNull()
    }

    /** Le module (x, y) fait-il partie d'un des trois yeux de repérage de 7 × 7 ? */
    public fun isEye(x: Int, y: Int, size: Int): Boolean {
        val eye = MeeshyCodeCardRecipe.EYE_MODULES
        val inX = x < eye || x >= size - eye
        val inY = y < eye || y >= size - eye
        return inX && inY && !(x >= size - eye && y >= size - eye)
    }
}
