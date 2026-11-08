package me.meeshy.app.chat

import android.content.ContentResolver
import android.net.Uri
import android.view.View
import android.webkit.MimeTypeMap
import androidx.core.view.ContentInfoCompat
import androidx.core.view.OnReceiveContentListener
import androidx.core.view.ViewCompat
import java.io.File
import java.util.UUID
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.paste.PastedContentRouter
import me.meeshy.sdk.model.paste.PastedKind

/**
 * Le récepteur de contenu riche du composeur (GIF et autocollants de clavier, image ou fichier collés) : miroir de
 * `ComposerPasteInterceptor` (iOS). Tout ce qui porte une adresse devient une PIÈCE via [onPickFile] — jamais un chemin
 * dans le champ ; le texte brut n'est pas pris (il revient au champ, qui décide d'insérer ou de plier en `.txt`).
 * Un média plus gros que [maxBytes] est refusé avec [onRejected], sans plantage.
 */
internal class PasteContentReceiver(
    private val contentResolver: ContentResolver,
    private val workDir: File,
    private val scope: CoroutineScope,
    private val ioDispatcher: CoroutineDispatcher,
    private val onPickFile: (file: File, fileName: String, mimeType: String?) -> Unit,
    private val onRejected: () -> Unit,
    private val maxBytes: Long = MAX_BYTES,
) : OnReceiveContentListener {

    override fun onReceiveContent(view: View, payload: ContentInfoCompat): ContentInfoCompat? {
        val clip = payload.clip
        val mimes = (0 until clip.description.mimeTypeCount).map { clip.description.getMimeType(it) }
        if (PastedContentRouter.classify(mimes) == PastedKind.Text) return payload
        val parts = payload.partition { it.uri != null }
        val rest = parts.second
        val items = parts.first?.clip ?: return rest
        for (i in 0 until items.itemCount) {
            val uri = items.getItemAt(i).uri ?: continue
            val mime = contentResolver.getType(uri) ?: items.description.getMimeType(0)
            scope.launch { ingest(uri, mime) }
        }
        return rest
    }

    private suspend fun ingest(uri: Uri, mime: String?) {
        val file = withContext(ioDispatcher) { copy(uri, mime) }
        if (file == null) onRejected() else onPickFile(file, file.name, mime)
    }

    private fun copy(uri: Uri, mime: String?): File? = runCatching {
        workDir.mkdirs()
        val ext = mime?.let { MimeTypeMap.getSingleton().getExtensionFromMimeType(it) }
        val target = File(workDir, "paste-${UUID.randomUUID()}" + (ext?.let { ".$it" } ?: ""))
        var total = 0L
        contentResolver.openInputStream(uri)?.use { input ->
            target.outputStream().use { out ->
                val buffer = ByteArray(BUFFER)
                while (true) {
                    val n = input.read(buffer)
                    if (n < 0) break
                    total += n
                    if (total > maxBytes) {
                        target.delete()
                        return@runCatching null
                    }
                    out.write(buffer, 0, n)
                }
            }
        } ?: return@runCatching null
        target
    }.getOrNull()

    internal companion object {
        const val MAX_BYTES: Long = 100L * 1024 * 1024
        private const val BUFFER = 16 * 1024
        val MIME_TYPES: Array<String> = arrayOf("image/*", "video/*", "audio/*", "application/*", "text/uri-list")

        fun install(view: View, receiver: PasteContentReceiver) =
            ViewCompat.setOnReceiveContentListener(view, MIME_TYPES, receiver)

        fun uninstall(view: View) = ViewCompat.setOnReceiveContentListener(view, null, null)
    }
}
