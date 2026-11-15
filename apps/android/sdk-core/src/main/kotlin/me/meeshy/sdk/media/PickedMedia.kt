package me.meeshy.sdk.media

import java.io.File
import java.io.IOException
import java.io.InputStream
import java.util.UUID

/**
 * **L'unique site de copie d'un média sorti du sélecteur** (miroir de `PickedMediaStaging` d'iOS) : le
 * contenu est copié en flux dans le cache de l'app sous un nom UNIQUE `picked_<uuid>.<ext>`, l'extension du
 * conteneur reçu étant GARDÉE en minuscules (un `.mov` reste un `.mov`). Une copie ratée ne laisse aucun
 * fichier derrière elle, et les orphelins d'un processus mort sont purgés au lancement ([sweepOrphans]).
 */
public object PickedMedia {
    public const val DIRECTORY: String = "picked-media"
    public const val FILE_PREFIX: String = "picked_"
    public const val FALLBACK_EXTENSION: String = "mov"
    private const val BUFFER_BYTES = 64 * 1024

    public fun directory(cacheDir: File): File = File(cacheDir, DIRECTORY)

    /** L'extension du nom reçu, minuscule et sans point ; [fallback] quand il n'en porte pas (ou en porte une douteuse). */
    public fun extensionOf(name: String?, fallback: String = FALLBACK_EXTENSION): String {
        val ext = name?.substringAfterLast('.', "")?.lowercase().orEmpty()
        return ext.takeIf { it.isNotEmpty() && it.length <= 8 && it.all(Char::isLetterOrDigit) } ?: fallback
    }

    /**
     * Copie [input] dans [cacheDir]/[DIRECTORY]. Lève l'[IOException] d'origine si la copie échoue — après avoir
     * supprimé le fichier à moitié écrit.
     */
    @Throws(IOException::class)
    public fun stage(
        input: InputStream,
        cacheDir: File,
        sourceName: String? = null,
        fallbackExtension: String = FALLBACK_EXTENSION,
    ): File {
        val directory = directory(cacheDir)
        if (!directory.isDirectory && !directory.mkdirs()) throw IOException("dossier de copie indisponible")
        val destination = File(directory, "$FILE_PREFIX${UUID.randomUUID()}.${extensionOf(sourceName, fallbackExtension)}")
        try {
            destination.outputStream().use { out ->
                val buffer = ByteArray(BUFFER_BYTES)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    out.write(buffer, 0, read)
                }
            }
        } catch (error: Exception) {
            destination.delete()
            throw error
        }
        return destination
    }

    public fun discard(staged: File) {
        staged.delete()
    }

    /**
     * Purge au lancement : aucune copie ne survit à son propriétaire (le processus), donc tout fichier plus ancien que
     * [processStartedAt] est un orphelin. Rend le nombre de fichiers supprimés.
     */
    public fun sweepOrphans(cacheDir: File, processStartedAt: Long): Int =
        directory(cacheDir).listFiles().orEmpty()
            .filter { it.name.startsWith(FILE_PREFIX) && it.lastModified() < processStartedAt }
            .count { it.delete() }
}
