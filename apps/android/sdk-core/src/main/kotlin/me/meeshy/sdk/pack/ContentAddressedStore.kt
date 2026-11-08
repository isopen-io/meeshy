package me.meeshy.sdk.pack

import android.content.Context
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.pack.PackAssetRef

/** Les octets reçus ne sont pas ceux que la référence engage. */
class DigestMismatchException(file: String) : IOException("empreinte différente de celle annoncée : $file")

/** Ce qui efface des fichiers du magasin des packs — [ContentAddressedStore] en production, un double en test. */
interface PackFilePruning {
    suspend fun prune(names: Set<String>): Set<String>
}

/**
 * **Les octets d'un pack officiel, sur l'appareil, vérifiés** — miroir de `ContentAddressedStore` (iOS).
 *
 * Un fichier se nomme par son empreinte : il ne change jamais, donc il ne se revalide jamais — il se lit du disque, ou
 * se télécharge UNE fois et se garde. Chaque lecture vérifie le SHA-256 : un fichier altéré sur le disque se retélécharge,
 * un fichier altéré en route ne s'écrit pas. Des demandes simultanées du même fichier ne font qu'une requête.
 *
 * Le dossier est [defaultDirectory] (`noBackupFilesDir`) : exclu de la sauvegarde automatique, jamais vidé par le système
 * sous pression de stockage comme le cache, et sans rapport avec le cache d'images — un pack installé ne s'évince pas.
 */
class ContentAddressedStore(
    private val directory: File,
    private val fetcher: PackAssetFetching,
    private val io: CoroutineDispatcher,
) : PackFilePruning, PackAssetReading {
    private val lock = Mutex()
    private val inFlight = HashMap<String, Deferred<ByteArray>>()
    private val scope = CoroutineScope(SupervisorJob() + io)

    /** Les octets de [ref] : du disque s'ils y sont intacts, sinon du réseau (une requête), vérifiés puis gardés. */
    override suspend fun data(ref: PackAssetRef): ByteArray {
        readVerified(ref)?.let { return it }
        val bytes = download(ref)
        if (!matches(bytes, ref)) throw DigestMismatchException(ref.src)
        return bytes
    }

    /** Le fichier est-il sur le disque, intact ? Sans réseau. */
    suspend fun contains(ref: PackAssetRef): Boolean = readVerified(ref) != null

    /** Efface les fichiers nommés, sauf ceux qu'un téléchargement écrit en ce moment ; rend ceux qui sont partis. */
    override suspend fun prune(names: Set<String>): Set<String> = lock.withLock {
        withContext(io) {
            names.filter { PackAssetRef.isContentAddressed(it) && it !in inFlight }
                .filter { File(directory, it).let { file -> file.exists() && file.delete() } }
                .toSet()
        }
    }

    /** Une seule requête pour des demandes simultanées : la tâche vérifie, écrit, puis se retire de la liste des vols. */
    private suspend fun download(ref: PackAssetRef): ByteArray {
        val running = lock.withLock {
            inFlight.getOrPut(ref.src) {
                scope.async {
                    try {
                        val bytes = fetcher.fetch(ref)
                        if (!matches(bytes, ref)) throw DigestMismatchException(ref.src)
                        write(bytes, ref.src)
                        bytes
                    } finally {
                        lock.withLock { inFlight.remove(ref.src) }
                    }
                }
            }
        }
        return running.await()
    }

    private suspend fun readVerified(ref: PackAssetRef): ByteArray? = withContext(io) {
        val file = File(directory, ref.src)
        val bytes = runCatching { file.readBytes() }.getOrNull() ?: return@withContext null
        if (matches(bytes, ref)) bytes else { file.delete(); null }
    }

    private suspend fun write(bytes: ByteArray, name: String): Unit = withContext(io) {
        directory.mkdirs()
        val temp = File(directory, "$name.part")
        temp.writeBytes(bytes)
        if (!temp.renameTo(File(directory, name))) {
            temp.delete()
            throw IOException("écriture impossible : $name")
        }
    }

    companion object {
        /** `noBackupFilesDir/meeshy-packs` : hors sauvegarde automatique, hors cache évincable. */
        fun defaultDirectory(context: Context): File = File(context.noBackupFilesDir, "meeshy-packs")

        fun matches(bytes: ByteArray, ref: PackAssetRef): Boolean = sha256Hex(bytes) == ref.sha256

        fun sha256Hex(bytes: ByteArray): String =
            MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    }
}
