package me.meeshy.app.chat.fileviewer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.contacts.vcard.VCard
import me.meeshy.sdk.model.contacts.vcard.VCardParser
import me.meeshy.sdk.model.fileviewer.BoundedTextReader

/**
 * Ce que les visionneuses lisent du fichier téléchargé : tout passe par le `ContentResolver` sur l'URI que le
 * système a donnée au téléchargement (jamais un chemin de fichier), hors du fil principal, avec une borne de taille.
 */
internal object FileViewerIo {

    /** Une carte de visite pèse quelques Ko ; au-delà, ce n'est plus une carte. */
    private const val MAX_CARD_BYTES = 256 * 1024

    suspend fun readText(context: Context, uri: Uri): BoundedTextReader.Result = withContext(Dispatchers.IO) {
        val stream = context.contentResolver.openInputStream(uri) ?: throw IOException("unreadable")
        stream.use { BoundedTextReader.read(it) }
    }

    /** La carte lue, ou `null` quand le fichier n'est pas une vCard lisible. */
    suspend fun readCard(context: Context, uri: Uri): VCard? = withContext(Dispatchers.IO) {
        val stream = context.contentResolver.openInputStream(uri) ?: throw IOException("unreadable")
        val read = stream.use { BoundedTextReader.read(it, MAX_CARD_BYTES) }
        if (read.isBinary || read.truncated) null else VCardParser.parse(read.text)
    }

    /** Copie le fichier téléchargé vers l'emplacement que l'utilisateur a choisi (sélecteur système). */
    suspend fun copy(context: Context, from: Uri, to: Uri): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            val input = context.contentResolver.openInputStream(from) ?: return@runCatching false
            val output = context.contentResolver.openOutputStream(to, "w") ?: return@runCatching false
            input.use { source -> output.use { sink -> source.copyTo(sink) } }
            true
        }.getOrDefault(false)
    }
}

/**
 * Un PDF ouvert page à page : le moteur système ([PdfRenderer]) n'ouvre qu'UNE page à la fois, donc le rendu est
 * sérialisé, et chaque page est rendue à la demande, à la largeur de l'écran (jamais le document entier en mémoire).
 */
internal class PdfPages private constructor(
    private val descriptor: ParcelFileDescriptor,
    private val renderer: PdfRenderer,
) {
    private val lock = Mutex()
    private var closed = false
    val pageCount: Int = renderer.pageCount

    suspend fun render(index: Int, widthPx: Int): Bitmap? = withContext(Dispatchers.IO) {
        lock.withLock {
            if (closed) return@withLock null
            runCatching {
                renderer.openPage(index).use { page ->
                    val width = widthPx.coerceIn(MIN_WIDTH_PX, MAX_WIDTH_PX)
                    val height = (width.toLong() * page.height / page.width.coerceAtLeast(1)).toInt().coerceIn(1, MAX_HEIGHT_PX)
                    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                    Canvas(bitmap).drawColor(Color.WHITE)
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    bitmap
                }
            }.getOrNull()
        }
    }

    /**
     * Ferme le document APRÈS la page en cours de rendu (le moteur refuse de se fermer sur une page ouverte), sans
     * bloquer le fil principal qui ferme la feuille.
     */
    fun close() {
        closer.launch {
            lock.withLock {
                if (closed) return@withLock
                closed = true
                runCatching { renderer.close() }
                runCatching { descriptor.close() }
            }
        }
    }

    companion object {
        private val closer = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        private const val MIN_WIDTH_PX = 200
        private const val MAX_WIDTH_PX = 1080
        private const val MAX_HEIGHT_PX = 3200

        /** Ouvre le document, ou `null` s'il est protégé, corrompu ou vide. */
        suspend fun open(context: Context, uri: Uri): PdfPages? = withContext(Dispatchers.IO) {
            val descriptor = runCatching { context.contentResolver.openFileDescriptor(uri, "r") }.getOrNull()
                ?: return@withContext null
            runCatching {
                val renderer = PdfRenderer(descriptor)
                if (renderer.pageCount <= 0) { renderer.close(); descriptor.close(); null } else PdfPages(descriptor, renderer)
            }.getOrElse { runCatching { descriptor.close() }; null }
        }
    }
}
