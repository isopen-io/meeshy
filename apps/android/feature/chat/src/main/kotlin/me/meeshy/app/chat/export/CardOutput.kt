package me.meeshy.app.chat.export

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File
import java.io.OutputStream
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
 * Comment la galerie s'écrit à ce niveau d'API : CLOISONNÉE (29+, album de l'app sans permission)
 * ou HISTORIQUE (26–28, fichier public sous `WRITE_EXTERNAL_STORAGE`, demandée par la porte unique).
 */
enum class CardGalleryRoute {
    SCOPED,
    LEGACY,
    ;

    companion object {
        fun of(sdkInt: Int): CardGalleryRoute = if (sdkInt >= Build.VERSION_CODES.Q) SCOPED else LEGACY
    }
}

/**
 * Ce que « Sauvegarder » et « Partager » produisent. 100 % local : la carte est peinte à partir du
 * clair déjà lu, et rien n'est envoyé au serveur (donc rien en conversation chiffrée non plus).
 * L'image part à pleine taille, peinte et encodée hors du thread principal.
 */
object CardOutput {

    private fun fileName(): String {
        val now = System.currentTimeMillis()
        return CardSubjects.fileName(now, TimeZone.getDefault().getOffset(now) / 1000)
    }

    /**
     * Enregistre la carte dans l'album « Meeshy ». Dès l'API 29, l'album de l'app s'écrit sans
     * permission (stockage cloisonné) ; en deçà (Android 8–9, le S8), il exige
     * `WRITE_EXTERNAL_STORAGE`, que l'appelant obtient d'abord par la porte unique
     * (`PermissionNature.PHOTO_LIBRARY_ADD`) : le fichier est écrit dans `Pictures/Meeshy` puis
     * indexé par MediaStore, pour paraître dans la galerie.
     */
    suspend fun saveToGallery(context: Context, input: CardInput): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val bitmap = CardRenderer.render(input).bitmap
            try {
                val name = fileName()
                when (CardGalleryRoute.of(Build.VERSION.SDK_INT)) {
                    CardGalleryRoute.SCOPED -> saveScoped(context, name) { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
                    CardGalleryRoute.LEGACY -> saveLegacy(
                        context,
                        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                        name,
                    ) { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
                }
            } finally {
                bitmap.recycle()
            }
            Unit
        }
    }

    private fun saveScoped(context: Context, name: String, write: (OutputStream) -> Unit) {
        val resolver = context.contentResolver
        val pending = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, MIME)
            put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/$ALBUM")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val item = checkNotNull(resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, pending)) { "insert" }
        try {
            checkNotNull(resolver.openOutputStream(item)) { "stream" }.use(write)
            resolver.update(item, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
        } catch (t: Throwable) {
            resolver.delete(item, null, null)
            throw t
        }
    }

    /** Android 8–9 : le fichier public, puis son entrée MediaStore. Un échec ne laisse ni fichier ni entrée. */
    @Suppress("DEPRECATION")
    internal fun saveLegacy(context: Context, pictures: File, name: String, write: (OutputStream) -> Unit): File {
        val album = File(pictures, ALBUM).apply { mkdirs() }
        val file = File(album, name)
        try {
            file.outputStream().use(write)
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, MIME)
                put(MediaStore.MediaColumns.DATA, file.absolutePath)
            }
            checkNotNull(context.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)) { "insert" }
        } catch (t: Throwable) {
            file.delete()
            throw t
        }
        return file
    }

    private const val ALBUM = "Meeshy"
    private const val MIME = "image/png"

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
