package me.meeshy.ui.component.media

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import java.io.File
import java.io.IOException

/**
 * Exporte une ressource média vers un fichier ordinaire (sauvegarde, partage) en la lisant par la
 * [dataSourceFactory] du cache : les tronçons déjà là sont servis du disque, le reste vient du
 * réseau et se range au passage. SimpleCache stocke des tronçons, pas un fichier unique : il n'y
 * a donc jamais d'URL de fichier à remettre, seulement cette copie en flux (64 Ko), écrite dans un
 * fichier `.part` renommé à la fin pour qu'un export interrompu ne laisse pas de fichier tronqué.
 * Bloquante : l'appelant choisit son thread d'E/S.
 */
@UnstableApi
public class MediaFileExporter(
    private val dataSourceFactory: DataSource.Factory,
) {
    /** Copie [url] dans [target] et rend le nombre d'octets écrits ; [IOException] en cas d'échec. */
    @Throws(IOException::class)
    public fun export(url: String, target: File): Long {
        target.absoluteFile.parentFile?.mkdirs()
        val partial = File(target.absoluteFile.parentFile, "${target.name}.part")
        val source = dataSourceFactory.createDataSource()
        try {
            source.open(DataSpec(Uri.parse(url)))
            val written = partial.outputStream().buffered().use { out -> copy(source, out) }
            if (!partial.renameTo(target)) {
                partial.copyTo(target, overwrite = true)
            }
            return written
        } finally {
            runCatching { source.close() }
            partial.delete()
        }
    }

    private fun copy(source: DataSource, out: java.io.OutputStream): Long {
        val buffer = ByteArray(BUFFER_BYTES)
        var total = 0L
        while (true) {
            val read = source.read(buffer, 0, buffer.size)
            if (read == C.RESULT_END_OF_INPUT) return total
            out.write(buffer, 0, read)
            total += read
        }
    }

    private companion object {
        const val BUFFER_BYTES = 64 * 1024
    }
}
