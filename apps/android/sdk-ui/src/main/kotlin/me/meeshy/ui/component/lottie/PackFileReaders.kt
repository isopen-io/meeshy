package me.meeshy.ui.component.lottie

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.pack.PackAssetRef
import java.io.File
import java.io.InputStream

/** Composer les sources d'octets d'un fichier de pack (#13952). */
public object PackFileReaders {
    /** Le premier lecteur qui a le fichier l'emporte ; les suivants ne sont pas sollicités. */
    public fun firstOf(vararg readers: PackFileReader): PackFileReader = PackFileReader { ref ->
        readers.firstNotNullOfOrNull { it.read(ref) }
    }
}

/**
 * **Les couches embarquées** : les fichiers que le catalogue d'apparence référence, copiés dans les assets du SDK à
 * côté du catalogue (`appearance-lottie/<sha16>.json`, `sync-appearance-catalog-android.ts`) — comme le web, qui les
 * embarque. Elles jouent dès le premier rendu, sans réseau. Un fichier absent se lit `null`, jamais en erreur.
 */
public class BundledPackFileReader(
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val open: (String) -> InputStream,
) : PackFileReader {
    override suspend fun read(ref: PackAssetRef): ByteArray? = withContext(dispatcher) {
        runCatching { open("$FOLDER/${ref.src}").use { it.readBytes() } }.getOrNull()
    }

    public companion object {
        public const val FOLDER: String = "appearance-lottie"
    }
}

/**
 * **Le magasin disque** — miroir de `ContentAddressedStore` (iOS) : un fichier se télécharge UNE fois par [upstream],
 * son empreinte est vérifiée AVANT d'être gardé (`<dir>/<src>`, écriture atomique), et une copie altérée sur disque
 * se jette puis se relit. Rien d'invérifié n'est jamais servi depuis le disque.
 */
public class DiskCachedPackFileReader(
    private val dir: File,
    private val upstream: PackFileReader,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : PackFileReader {
    override suspend fun read(ref: PackAssetRef): ByteArray? {
        val target = File(dir, ref.src)
        withContext(dispatcher) { kept(target, ref) }?.let { return it }
        val fetched = upstream.read(ref)?.takeIf { matches(it, ref) } ?: return null
        withContext(dispatcher) { keep(target, fetched) }
        return fetched
    }

    private fun kept(target: File, ref: PackAssetRef): ByteArray? {
        if (!target.isFile) return null
        val data = runCatching { target.readBytes() }.getOrNull()
        if (data != null && matches(data, ref)) return data
        target.delete()
        return null
    }

    private fun keep(target: File, data: ByteArray) {
        runCatching {
            dir.mkdirs()
            val partial = File(dir, "${target.name}.part")
            partial.writeBytes(data)
            if (!partial.renameTo(target)) partial.delete()
        }
    }

    private fun matches(data: ByteArray, ref: PackAssetRef): Boolean =
        data.size.toLong() == ref.bytes && LottieLayerSource.sha256Hex(data).equals(ref.sha256, ignoreCase = true)
}
