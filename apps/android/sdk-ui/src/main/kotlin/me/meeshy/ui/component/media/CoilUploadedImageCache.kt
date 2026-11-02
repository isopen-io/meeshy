package me.meeshy.ui.component.media

import coil.ImageLoader
import coil.annotation.ExperimentalCoilApi
import coil.disk.DiskCache
import me.meeshy.sdk.media.UploadedMediaCache
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import okio.buffer
import java.io.InputStream

/**
 * Le cache disque de Coil (`image_cache`) adopte une image tout juste envoyée sous l'adresse que la bulle lira (#13876),
 * miroir de `TusUploadManager.seedMediaCache` → `CacheCoordinator.shared.images` (iOS) : sa première vue ne repasse pas
 * par le réseau. La clé est l'URL, celle que Coil donne à toute image chargée par adresse.
 *
 * Les métadonnées de l'entrée restent VIDES : c'est la forme que Coil réserve aux entrées posées à la main, qu'il sert
 * depuis le disque sans consulter d'en-têtes de fraîcheur. Une image déjà en cache n'est ni relue ni remplacée ; une
 * source qui échoue, trop courte ou trop longue, ou une entrée déjà en écriture n'adopte rien et ne laisse aucune trace.
 */
@OptIn(ExperimentalCoilApi::class)
public class CoilUploadedImageCache(private val loader: () -> ImageLoader) : UploadedMediaCache {

    override fun adopt(category: MediaCacheCategory, url: String, length: Long, open: () -> InputStream): Boolean {
        if (category != MediaCacheCategory.IMAGES || length <= 0L) return false
        val disk = loader().diskCache ?: return false
        disk.openSnapshot(url)?.use { return true }
        val editor = disk.openEditor(url) ?: return false
        val written = try {
            write(disk, editor, length, open)
        } catch (failure: Exception) {
            false
        }
        if (!written) {
            runCatching { editor.abort() }
            return false
        }
        return runCatching { editor.commit() }.isSuccess
    }

    private fun write(disk: DiskCache, editor: DiskCache.Editor, length: Long, open: () -> InputStream): Boolean {
        disk.fileSystem.write(editor.metadata) {}
        return disk.fileSystem.sink(editor.data).buffer().outputStream().use { out ->
            open().use { input -> copyExactly(input, out, length) }
        }
    }
}
