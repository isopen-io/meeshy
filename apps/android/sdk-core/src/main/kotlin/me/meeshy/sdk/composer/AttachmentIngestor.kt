package me.meeshy.sdk.composer

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.model.MimeTypeResolver
import me.meeshy.sdk.model.composer.PendingAttachmentType

/** Nom, type et taille d'une source choisie, lus sans copier son contenu. */
data class AttachmentSourceInfo(
    val fileName: String?,
    val mimeType: String,
    val sizeBytes: Long,
)

/** Une source copiée dans le dossier de travail, avec ce que sa vignette a appris. */
data class IngestedFile(
    val localPath: String,
    val sizeBytes: Long,
    val thumbnail: AttachmentThumbnail? = null,
)

/**
 * Copie les pièces choisies dans un dossier de travail privé (le grant de l'URI source
 * expire) — port du `ComposerFileImporter` iOS. Un échec se rend par `null`, jamais par
 * une pièce fantôme : l'appelant décide du message.
 */
interface AttachmentIngesting {
    suspend fun describe(uri: Uri): AttachmentSourceInfo
    suspend fun ingest(uri: Uri, id: String, info: AttachmentSourceInfo): IngestedFile?
    suspend fun ingestBytes(bytes: ByteArray, id: String, fileName: String?, mimeType: String): IngestedFile?
    suspend fun readBytes(path: String): ByteArray?
    suspend fun delete(paths: Collection<String>)
}

class AttachmentIngestor @Inject constructor(
    @ApplicationContext private val context: Context,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
    private val thumbnailer: AttachmentThumbnailing,
) : AttachmentIngesting {

    private val workDir: File get() = File(context.cacheDir, WORK_DIR_NAME).also { it.mkdirs() }

    override suspend fun describe(uri: Uri): AttachmentSourceInfo = withContext(ioDispatcher) {
        val resolver = context.contentResolver
        var name: String? = null
        var size = 0L
        runCatching {
            resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
                ?.use { cursor ->
                    if (!cursor.moveToFirst()) return@use
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                    if (nameIndex >= 0) name = cursor.getString(nameIndex)
                    if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
                }
        }
        val resolvedName = name?.trim()?.takeIf { it.isNotEmpty() } ?: uri.lastPathSegment?.takeIf { it.isNotBlank() }
        val declared = runCatching { resolver.getType(uri) }.getOrNull()
        AttachmentSourceInfo(
            fileName = resolvedName,
            mimeType = MimeTypeResolver.resolve(declared, resolvedName.orEmpty()),
            sizeBytes = size,
        )
    }

    override suspend fun ingest(uri: Uri, id: String, info: AttachmentSourceInfo): IngestedFile? =
        withContext(ioDispatcher) {
            val target = targetFile(id, info.fileName)
            val copied = runCatching {
                val input = context.contentResolver.openInputStream(uri) ?: return@runCatching false
                input.use { source -> target.outputStream().use { source.copyTo(it) } }
                true
            }.getOrDefault(false)
            if (!copied) {
                target.delete()
                return@withContext null
            }
            finish(target, id, info.mimeType)
        }

    override suspend fun ingestBytes(bytes: ByteArray, id: String, fileName: String?, mimeType: String): IngestedFile? =
        withContext(ioDispatcher) {
            if (bytes.isEmpty()) return@withContext null
            val target = targetFile(id, fileName)
            val written = runCatching { target.writeBytes(bytes) }.isSuccess
            if (!written) {
                target.delete()
                return@withContext null
            }
            finish(target, id, mimeType)
        }

    override suspend fun readBytes(path: String): ByteArray? =
        withContext(ioDispatcher) { runCatching { File(path).readBytes() }.getOrNull() }

    override suspend fun delete(paths: Collection<String>) {
        if (paths.isEmpty()) return
        withContext(ioDispatcher) { paths.forEach { runCatching { File(it).delete() } } }
    }

    private suspend fun finish(target: File, id: String, mimeType: String): IngestedFile {
        val type = PendingAttachmentType.forMime(mimeType)
        val thumbnail = thumbnailer.thumbnail(target, type, workDir, id)
        return IngestedFile(target.path, target.length(), thumbnail)
    }

    private fun targetFile(id: String, fileName: String?): File {
        val safe = fileName.orEmpty().substringAfterLast('/').replace(Regex("[^A-Za-z0-9._-]"), "_").take(MAX_NAME)
        return File(workDir, "${id}_${safe.ifEmpty { "attachment" }}")
    }

    private companion object {
        const val WORK_DIR_NAME = "composer-pending"
        const val MAX_NAME = 80
    }
}
