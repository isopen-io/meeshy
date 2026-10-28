package me.meeshy.sdk.media

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.util.UUID

/**
 * L'entrée d'un média choisi (#13553) : le contenu d'une URI ou d'un flux est COPIÉ EN FLUX, par un tampon de
 * [BUFFER_BYTES], dans un fichier du cache privé ([DIRECTORY]) dont Meeshy choisit le nom, puis remis sous forme de
 * [MediaUploadItem.onDisk]. Aucun tableau de la taille du média n'existe jamais, et la borne [DEFAULT_MAX_BYTES] se
 * vérifie PENDANT la copie : un fichier trop gros s'arrête au premier octet de trop, sans avoir rempli le disque.
 *
 * Le fichier est EN CLAIR dans le cache privé : il est effacé quand l'élément est retiré ou envoyé ([release]), une copie
 * oubliée (processus tué) part au balayage suivant ([TTL_MS]) et tout part à la déconnexion ([MediaIntakeTeardown]).
 */
public object MediaIntake {
    public const val DIRECTORY: String = "media-intake"
    public const val DEFAULT_MAX_BYTES: Long = 512L * 1024L * 1024L
    public const val TTL_MS: Long = 24L * 60L * 60_000L
    private const val BUFFER_BYTES = 64 * 1024

    public fun directory(cacheDir: File): File = File(cacheDir, DIRECTORY)

    /** Copie [input] en flux ; `null` si le flux ne se lit pas (erreur d'E/S ou exception d'un fournisseur) ou dépasse [maxBytes] (rien ne reste sur le disque). */
    public fun copy(
        input: InputStream,
        cacheDir: File,
        fileName: String,
        mimeType: String,
        maxBytes: Long = DEFAULT_MAX_BYTES,
        now: () -> Long = System::currentTimeMillis,
    ): MediaUploadItem? {
        val directory = directory(cacheDir)
        if (!directory.isDirectory && !directory.mkdirs()) return null
        sweep(cacheDir, now())
        val target = freshFile(directory)
        val kept = try {
            target.outputStream().use { out -> copyBounded(input, out, maxBytes) }
        } catch (_: IOException) {
            false
        } catch (_: RuntimeException) {
            false
        }
        if (!kept) {
            target.delete()
            return null
        }
        return MediaUploadItem.onDisk(target, fileName, mimeType)
    }

    /**
     * Prend en charge un fichier que l'application vient de produire (enregistrement vocal, rendu vidéo) : il CHANGE DE
     * NOM vers [DIRECTORY] (aucune octet recopié), ou se copie en flux si le renommage échoue. `null` si le fichier est vide.
     */
    public fun adopt(file: File, cacheDir: File, fileName: String, mimeType: String): MediaUploadItem? {
        if (!file.isFile || file.length() == 0L) return null
        val directory = directory(cacheDir)
        if (!directory.isDirectory && !directory.mkdirs()) return null
        val target = freshFile(directory)
        if (file.renameTo(target)) return MediaUploadItem.onDisk(target, fileName, mimeType)
        val copied = file.inputStream().use { copy(it, cacheDir, fileName, mimeType) }
        file.delete()
        return copied
    }

    /** Efface la copie d'un élément qui n'est plus ni affiché ni envoyé ; sans effet sur un fichier qui n'est pas une copie d'entrée. */
    public fun release(item: MediaUploadItem) {
        val file = (item.source as? MediaUploadSource.OnDisk)?.file ?: return
        if (file.parentFile?.name == DIRECTORY) file.delete()
    }

    /** Les copies oubliées depuis plus de [TTL_MS] quittent le disque. */
    public fun sweep(cacheDir: File, now: Long) {
        directory(cacheDir).listFiles().orEmpty().filter { now - it.lastModified() > TTL_MS }.forEach { it.delete() }
    }

    /** La frontière de compte : toute copie en clair quitte le disque. */
    public fun clear(cacheDir: File) {
        directory(cacheDir).listFiles().orEmpty().forEach { it.delete() }
    }

    /** Le nom du fichier est GÉNÉRÉ : le nom annoncé par le fournisseur ne reste qu'une métadonnée et ne choisit jamais le chemin. */
    private fun freshFile(directory: File): File = File(directory, UUID.randomUUID().toString()).also {
        check(it.canonicalPath.startsWith(directory.canonicalPath + File.separator)) { "copie hors de $DIRECTORY" }
    }

    private fun copyBounded(input: InputStream, out: java.io.OutputStream, maxBytes: Long): Boolean {
        val buffer = ByteArray(BUFFER_BYTES)
        var total = 0L
        while (true) {
            val read = input.read(buffer)
            if (read < 0) return true
            total += read
            if (total > maxBytes) return false
            out.write(buffer, 0, read)
        }
    }
}

/** Lit l'URI choisie en [MediaUploadItem] adossé à un fichier du cache privé ; `null` si le flux ne s'ouvre pas ou dépasse [maxBytes]. */
public fun ContentResolver.readMediaUploadItem(
    uri: Uri,
    cacheDir: File,
    maxBytes: Long = MediaIntake.DEFAULT_MAX_BYTES,
): MediaUploadItem? {
    val name = displayNameOf(uri).orEmpty()
    val mime = getType(uri).orEmpty()
    val input = runCatching { openInputStream(uri) }.getOrNull() ?: return null
    return input.use { MediaIntake.copy(it, cacheDir, name, mime, maxBytes) }
}

/** [ContentResolver.readMediaUploadItem] vers le cache privé de l'application. */
public fun Context.readMediaUploadItem(uri: Uri, maxBytes: Long = MediaIntake.DEFAULT_MAX_BYTES): MediaUploadItem? =
    contentResolver.readMediaUploadItem(uri, cacheDir, maxBytes)

/** Le nom annoncé par le fournisseur de contenu, ou `null`. */
public fun ContentResolver.displayNameOf(uri: Uri): String? =
    runCatching {
        query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
        }
    }.getOrNull()

/** Ce que Coil charge pour l'aperçu : le fichier lui-même (jamais relu à chaque recomposition), ou les octets déjà en mémoire. */
public val MediaUploadItem.previewModel: Any
    get() = when (val s = source) {
        is MediaUploadSource.OnDisk -> s.file
        is MediaUploadSource.InMemory -> s.bytes
        else -> bytes
    }
