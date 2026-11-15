package me.meeshy.app.chat

import android.content.ClipData
import android.content.ContentResolver
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import java.io.File
import java.util.UUID
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.MimeTypeResolver

/** Ce qu'un élément déposé ou collé devient (miroir de `ComposerIngest`, iOS). */
internal sealed interface ComposerIngest {
    /** Le fichier est DÉJÀ copié dans le cache de l'app ; l'appelant en devient propriétaire. */
    data class Copied(val file: File, val name: String, val mime: String) : ComposerIngest

    data class Text(val text: String) : ComposerIngest

    /** Refusé (dossier, 0 octet, lecture morte) : [name] nourrit le toast d'échec, `null` = élément sans nom. */
    data class Failed(val name: String?) : ComposerIngest
}

/**
 * Résout un élément de presse-papiers ou de dépôt en [ComposerIngest] (miroir de `ComposerDropResolver`, iOS) : le
 * contenu est copié IMMÉDIATEMENT dans [workDir], car l'autorisation de l'URI s'éteint avec le geste. Le nom d'origine
 * prime sur celui que le système fabrique ; un dossier et un fichier de 0 octet sont refusés.
 */
internal class ComposerDropResolver(
    private val contentResolver: ContentResolver,
    private val workDir: File,
    private val ioDispatcher: CoroutineDispatcher,
) {
    suspend fun resolve(item: ClipData.Item): ComposerIngest = withContext(ioDispatcher) {
        val uri = item.uri
        if (uri == null) {
            val text = item.text?.toString().orEmpty()
            return@withContext if (text.isEmpty()) ComposerIngest.Failed(null) else ComposerIngest.Text(text)
        }
        runCatching { copy(uri) }.getOrElse { ComposerIngest.Failed(displayName(uri)) }
    }

    private fun copy(uri: Uri): ComposerIngest {
        val declared = contentResolver.getType(uri)
        val name = displayName(uri)
        if (declared == DocumentsContract.Document.MIME_TYPE_DIR) return ComposerIngest.Failed(name)
        val finalName = name ?: "file-${UUID.randomUUID()}"
        val dir = File(workDir, "drop-${UUID.randomUUID()}").apply { mkdirs() }
        val target = File(dir, finalName.replace('/', '_'))
        val total = contentResolver.openInputStream(uri)?.use { input ->
            target.outputStream().use { input.copyTo(it) }
        } ?: 0L
        if (total <= 0L) {
            dir.deleteRecursively()
            return ComposerIngest.Failed(name)
        }
        return ComposerIngest.Copied(target, target.name, MimeTypeResolver.resolve(declared, target.name))
    }

    private fun displayName(uri: Uri): String? {
        val queried = runCatching {
            contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
        }.getOrNull()
        return (queried ?: uri.lastPathSegment)?.takeIf { it.isNotBlank() }
    }
}
