package me.meeshy.ui.component.viewer

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.GallerySaveTargetResolver

/**
 * « Partager hors de Meeshy » — miroir de `shareCurrentOutsideMeeshy`
 * (`ConversationMediaGalleryView+Menu.swift`) : va DROIT à la feuille de partage système,
 * avec une copie locale du média servie par le `FileProvider` de l'application
 * (`${packageName}.fileprovider`, chemin `cache/shared-media/`). Le nom et le type viennent de
 * la même loi que l'enregistrement ([GallerySaveTargetResolver]) : les deux sorties nomment le
 * fichier pareil. Glue Android exempte : un exécutant, sans décision produit.
 */
public object GalleryMediaSharer {

    public suspend fun share(context: Context, url: String, chooserTitle: String): Result<Unit> =
        try {
            val target = GallerySaveTargetResolver.resolve(url = url, mimeHint = null)
            val file = withContext(Dispatchers.IO) { copyToCache(context, url, target.displayName) }
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val send = Intent(Intent.ACTION_SEND)
                .setType(target.mimeType)
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            val chooser = Intent.createChooser(send, chooserTitle)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            context.startActivity(chooser)
            Result.success(Unit)
        } catch (c: CancellationException) {
            throw c
        } catch (t: Throwable) {
            Result.failure(t)
        }

    private fun copyToCache(context: Context, url: String, displayName: String): File {
        val directory = File(context.cacheDir, SHARED_DIRECTORY).apply { mkdirs() }
        directory.listFiles()?.forEach { it.delete() }
        val file = File(directory, displayName)
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = TIMEOUT_MS
        connection.readTimeout = TIMEOUT_MS
        connection.instanceFollowRedirects = true
        try {
            connection.inputStream.use { input -> file.outputStream().use { input.copyTo(it) } }
        } finally {
            connection.disconnect()
        }
        return file
    }

    private const val SHARED_DIRECTORY = "shared-media"
    private const val TIMEOUT_MS = 15_000
}
