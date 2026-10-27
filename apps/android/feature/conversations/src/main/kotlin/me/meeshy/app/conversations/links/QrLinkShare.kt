package me.meeshy.app.conversations.links

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import androidx.core.content.FileProvider
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import java.io.File

/**
 * Le QR d'un lien, partagé comme image (iOS `generateQRAndShare` : correction « H », échelle 10).
 * Noir sur blanc : le fichier part hors de Meeshy, il doit se lire sur n'importe quel fond.
 */
internal object QrLinkShare {

    fun render(content: String, size: Int = QR_SIZE): Bitmap? = runCatching {
        val hints = mapOf(EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.H, EncodeHintType.MARGIN to 2)
        val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, size, size, hints)
        val pixels = IntArray(matrix.width * matrix.height) { i ->
            if (matrix[i % matrix.width, i / matrix.width]) Color.BLACK else Color.WHITE
        }
        Bitmap.createBitmap(pixels, matrix.width, matrix.height, Bitmap.Config.ARGB_8888)
    }.getOrNull()

    /** Écrit le PNG dans `cache/shared-media/` (chemin déjà servi par le `FileProvider`) et ouvre la feuille de partage. */
    fun share(context: Context, bitmap: Bitmap, fileName: String, chooserTitle: String): Boolean = runCatching {
        val directory = File(context.cacheDir, SHARED_DIRECTORY).apply { mkdirs() }
        val file = File(directory, "$fileName.png")
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val send = Intent(Intent.ACTION_SEND)
            .setType("image/png")
            .putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        context.startActivity(
            Intent.createChooser(send, chooserTitle).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION),
        )
    }.isSuccess

    private const val SHARED_DIRECTORY = "shared-media"
    private const val QR_SIZE = 1024
}
