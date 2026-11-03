package me.meeshy.app.settings

import androidx.media3.datasource.cache.Cache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.cache.purge.MediaDiskStore
import me.meeshy.sdk.model.mediacache.MediaCacheKey
import me.meeshy.ui.component.media.MeeshyMediaCacheKey
import java.io.File
import java.security.MessageDigest

/**
 * Un stockage disque fait de fichiers à plat dans [directory] : la taille et la suppression se font PAR CLÉ, fichier par
 * fichier (jamais estimées), et une erreur sur un fichier ne quitte pas la boucle. [namesFor] dit quels fichiers une URL
 * a posés ; [isContent] écarte ce que le moteur du stockage possède seul (journal, fichiers temporaires). Un dossier
 * absent pèse zéro.
 */
internal class DirectoryMediaDiskStore(
    private val directory: File,
    private val namesFor: (String) -> List<String>,
    private val isContent: (File) -> Boolean = { true },
) : MediaDiskStore {

    override suspend fun totalBytes(): Long = withContext(Dispatchers.IO) { content().sumOf { it.length() } }

    override suspend fun bytesFor(urls: Set<String>): Long = withContext(Dispatchers.IO) {
        files(urls).sumOf { it.length() }
    }

    override suspend fun purge(urls: Set<String>): Long = withContext(Dispatchers.IO) { delete(files(urls)) }

    override suspend fun bytesExcluding(keep: Set<String>): Long = withContext(Dispatchers.IO) {
        residual(keep).sumOf { it.length() }
    }

    override suspend fun purgeExcluding(keep: Set<String>): Long = withContext(Dispatchers.IO) { delete(residual(keep)) }

    private fun content(): List<File> =
        directory.listFiles()?.filter { it.isFile && isContent(it) }.orEmpty()

    private fun files(urls: Set<String>): List<File> =
        urls.flatMap(namesFor).distinct().map { File(directory, it) }.filter { it.isFile && isContent(it) }

    private fun residual(keep: Set<String>): List<File> {
        val kept = keep.flatMap(namesFor).toSet()
        return content().filter { it.name !in kept }
    }

    private fun delete(files: List<File>): Long = files.sumOf { file ->
        val size = file.length()
        if (runCatching { file.delete() }.getOrDefault(false)) size else 0L
    }

    companion object {
        /** Cache disque de Coil : `<sha256 hex de l'URL>.0` (métadonnées) et `.1` (octets) ; `journal*` appartient à Coil. */
        fun coil(directory: File): DirectoryMediaDiskStore = DirectoryMediaDiskStore(
            directory = directory,
            namesFor = { url -> sha256Hex(url).let { listOf("$it.0", "$it.1") } },
            isContent = { !it.name.startsWith("journal") && !it.name.endsWith(".tmp") },
        )

        /** Cache typé : UN fichier entier par média sous sa clé canonique ; `.pins.json` n'est pas un média. */
        fun typed(directory: File): DirectoryMediaDiskStore = DirectoryMediaDiskStore(
            directory = directory,
            namesFor = { listOf(MediaCacheKey.of(it)) },
            isContent = { !it.name.startsWith(".") },
        )

        private fun sha256Hex(value: String): String =
            MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it) }
    }
}

/**
 * Un `SimpleCache` Media3 (audio, vidéo) : il possède son dossier, donc la mesure et la suppression passent par son
 * API, par ressource (clé canonique de l'URL), jamais par les fichiers dessous.
 */
internal class Media3DiskStore(private val cache: () -> Cache) : MediaDiskStore {

    override suspend fun totalBytes(): Long = withContext(Dispatchers.IO) { cache().cacheSpace }

    override suspend fun bytesFor(urls: Set<String>): Long = withContext(Dispatchers.IO) {
        urls.map(MeeshyMediaCacheKey::of).distinct().sumOf { size(it) }
    }

    override suspend fun purge(urls: Set<String>): Long = withContext(Dispatchers.IO) {
        urls.map(MeeshyMediaCacheKey::of).distinct().sumOf { remove(it) }
    }

    override suspend fun bytesExcluding(keep: Set<String>): Long = withContext(Dispatchers.IO) {
        residual(keep).sumOf { size(it) }
    }

    override suspend fun purgeExcluding(keep: Set<String>): Long = withContext(Dispatchers.IO) {
        residual(keep).sumOf { remove(it) }
    }

    private fun residual(keep: Set<String>): List<String> {
        val kept = keep.map(MeeshyMediaCacheKey::of).toSet()
        return cache().keys.filter { it !in kept }
    }

    private fun size(key: String): Long = runCatching { cache().getCachedSpans(key).sumOf { it.length } }.getOrDefault(0L)

    private fun remove(key: String): Long {
        val before = size(key)
        return if (runCatching { cache().removeResource(key) }.isSuccess) before else 0L
    }
}
