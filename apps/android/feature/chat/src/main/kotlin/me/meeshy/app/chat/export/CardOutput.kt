package me.meeshy.app.chat.export

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File
import java.util.TimeZone
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** SharedPreferences, sous les mêmes clés que le web et iOS. */
class AndroidCardPreferenceStore(context: Context) : CardPreferenceStore {
    private val prefs = context.applicationContext.getSharedPreferences("meeshy_message_card", Context.MODE_PRIVATE)
    override fun string(key: String): String? = prefs.getString(key, null)
    override fun putString(key: String, value: String) = prefs.edit().putString(key, value).apply()
}

/**
 * Ce que « Sauvegarder » et « Partager » produisent. 100 % local : la carte est peinte à partir du
 * clair déjà lu, et rien n'est envoyé au serveur (donc rien en conversation chiffrée non plus).
 * L'image part à pleine taille, peinte et encodée hors du thread principal.
 */
object CardOutput {

    val canSaveToGallery: Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

    private fun fileName(): String =
        CardSubjects.fileName(System.currentTimeMillis(), TimeZone.getDefault().rawOffset / 1000)

    suspend fun saveToGallery(context: Context, input: CardInput): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            check(canSaveToGallery) { "Gallery save requires Android 10+" }
            val bitmap = CardRenderer.render(input).bitmap
            try {
                val resolver = context.contentResolver
                val pending = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, fileName())
                    put(MediaStore.MediaColumns.MIME_TYPE, "image/png")
                    put(MediaStore.MediaColumns.RELATIVE_PATH, "Pictures/Meeshy")
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
                val item = checkNotNull(resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, pending)) { "insert" }
                try {
                    checkNotNull(resolver.openOutputStream(item)) { "stream" }.use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
                    resolver.update(item, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
                } catch (t: Throwable) {
                    resolver.delete(item, null, null)
                    throw t
                }
            } finally {
                bitmap.recycle()
            }
            Unit
        }
    }

    /** L'IMAGE, jamais le chemin d'un fichier temporaire : la feuille de partage la reçoit comme une photo. */
    suspend fun share(context: Context, input: CardInput, chooserTitle: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val bitmap = CardRenderer.render(input).bitmap
            val file = try {
                val directory = File(context.cacheDir, "shared-media").apply { mkdirs() }
                directory.listFiles()?.forEach { it.delete() }
                File(directory, fileName()).also { target ->
                    target.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
                }
            } finally {
                bitmap.recycle()
            }
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val send = Intent(Intent.ACTION_SEND)
                .setType("image/png")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            val chooser = Intent.createChooser(send, chooserTitle)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            withContext(Dispatchers.Main) { context.startActivity(chooser) }
        }
    }
}
