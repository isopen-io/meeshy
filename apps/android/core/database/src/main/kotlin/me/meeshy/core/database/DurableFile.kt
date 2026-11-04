package me.meeshy.core.database

import java.io.File
import java.io.FileOutputStream
import java.nio.channels.FileChannel
import java.nio.file.StandardOpenOption

/**
 * Écrit un petit fichier de service (marqueur, registre) de façon atomique : contenu écrit dans un fichier temporaire
 * voisin, synchronisé sur le disque, renommé par-dessus la cible, puis le dossier synchronisé quand le système le permet.
 * Un processus tué en cours d'écriture laisse l'ancienne version ou la nouvelle, jamais une version tronquée. Ne lève
 * jamais : rend `false` si le disque a refusé.
 */
internal object DurableFile {
    fun write(target: File, content: String): Boolean {
        val staged = File(target.path + STAGED)
        return try {
            FileOutputStream(staged).use { out ->
                out.write(content.toByteArray(Charsets.UTF_8))
                out.fd.sync()
            }
            val renamed = staged.renameTo(target)
            if (renamed) syncDirectory(target.absoluteFile.parentFile)
            renamed
        } catch (_: Exception) {
            false
        } finally {
            if (staged.exists()) staged.delete()
        }
    }

    private fun syncDirectory(directory: File?) {
        if (directory == null) return
        runCatching { FileChannel.open(directory.toPath(), StandardOpenOption.READ).use { it.force(true) } }
    }

    private const val STAGED = ".staged"
}
