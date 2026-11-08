package me.meeshy.sdk.media

import me.meeshy.sdk.model.mediacache.CachedFileInfo
import me.meeshy.sdk.model.mediacache.LruEvictionPlan
import me.meeshy.sdk.model.mediacache.MediaCacheBudget
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaCacheKey
import me.meeshy.sdk.model.mediacache.MediaPinTable
import java.io.File
import java.io.IOException

/**
 * **Le cache disque typé des médias téléchargés** (audio, image, vidéo), miroir de `DiskCacheStore` côté iOS. Un média
 * vit en UN fichier entier sous sa clé canonique ([MediaCacheKey]) dans le dossier de sa catégorie — l'emplacement que
 * [LocalMediaFileResolver] interroge déjà. Les octets arrivent d'un fichier de transit du MÊME volume ([stagingDir]) et
 * s'y rangent par un renommage : jamais d'octets chargés en mémoire.
 *
 * Borné : après chaque rangement, [LruEvictionPlan] évince les plus anciens (dernier accès) jusqu'à repasser sous le
 * budget, sans toucher une épingle active ni une clé en cours d'écriture.
 */
class TypedMediaCache(
    private val dirs: MediaCacheDirs,
    private val budgetOf: (MediaCacheCategory) -> Long = { MediaCacheBudget.of(it).diskMaxBytes },
    private val pins: suspend (MediaCacheCategory) -> MediaPinTable = { MediaPinTable() },
    private val clock: () -> Long = System::currentTimeMillis,
) {
    /** Le fichier entier de [url], ou `null`. Une lecture rafraîchit son rang LRU. */
    fun file(category: MediaCacheCategory, url: String): File? {
        val file = File(dirs.dirFor(category), MediaCacheKey.of(url))
        if (!file.isFile || file.length() <= 0L) return null
        file.setLastModified(clock())
        return file
    }

    /** Règle SYNCHRONE « déjà sur l'appareil » : un `stat`, sans rafraîchir le rang. */
    fun contains(category: MediaCacheCategory, url: String): Boolean {
        val file = File(dirs.dirFor(category), MediaCacheKey.of(url))
        return file.isFile && file.length() > 0L
    }

    /** Le dossier de transit d'une catégorie — sur le même volume que le cache, pour que le renommage soit atomique. */
    fun stagingDir(category: MediaCacheCategory): File = File(dirs.dirFor(category), STAGING_DIR).apply { mkdirs() }

    /** Vide les fichiers de transit laissés par un processus interrompu. */
    fun sweepStaging() {
        listOf(MediaCacheCategory.IMAGES, MediaCacheCategory.AUDIO, MediaCacheCategory.VIDEO).forEach { category ->
            File(dirs.dirFor(category), STAGING_DIR).listFiles()?.forEach { it.delete() }
        }
    }

    /**
     * Range [staged] sous la clé de [url] (renommage, repli copie) puis évince au budget. Rend le fichier rangé.
     * [staged] disparaît en cas de succès comme d'échec.
     */
    suspend fun store(category: MediaCacheCategory, url: String, staged: File, inFlightKeys: Set<String> = emptySet()): File {
        val dir = dirs.dirFor(category).apply { mkdirs() }
        val target = File(dir, MediaCacheKey.of(url))
        try {
            if (target.exists()) target.delete()
            if (!staged.renameTo(target)) {
                staged.copyTo(target, overwrite = true)
                staged.delete()
            }
        } catch (failure: IOException) {
            staged.delete()
            target.delete()
            throw failure
        }
        target.setLastModified(clock())
        evictToBudget(category, inFlightKeys + target.name)
        return target
    }

    fun remove(category: MediaCacheCategory, url: String) {
        File(dirs.dirFor(category), MediaCacheKey.of(url)).delete()
    }

    fun sizeOf(category: MediaCacheCategory): Long = entries(category).sumOf { it.length() }

    /** Vide la catégorie (changement de compte, purge). */
    fun clear(category: MediaCacheCategory) {
        entries(category).forEach { it.delete() }
    }

    suspend fun evictToBudget(category: MediaCacheCategory, inFlightKeys: Set<String> = emptySet()) {
        val infos = entries(category).map { CachedFileInfo(it.name, it.length(), it.lastModified()) }
        val victims = LruEvictionPlan.victims(infos, budgetOf(category), pins(category), clock(), inFlightKeys)
        val dir = dirs.dirFor(category)
        victims.forEach { File(dir, it).delete() }
    }

    private fun entries(category: MediaCacheCategory): List<File> =
        dirs.dirFor(category).listFiles { file -> file.isFile && !file.name.startsWith(".") }?.toList().orEmpty()

    private companion object {
        const val STAGING_DIR = ".staging"
    }
}
