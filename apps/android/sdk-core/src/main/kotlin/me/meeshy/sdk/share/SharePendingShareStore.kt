package me.meeshy.sdk.share

import android.util.AtomicFile
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.share.SharePendingShare
import me.meeshy.sdk.model.share.SharePendingShareCodec
import me.meeshy.sdk.session.PerAccountCache
import java.io.File
import java.io.IOException

/**
 * **Le magasin des fiches de reprise d'un partage** — un fichier JSON par partage, réécrit par renommage
 * atomique ([AtomicFile]) AVANT le premier octet envoyé. Un magasin fichier, pas Room : une migration
 * destructive de la base ne doit pas perdre un envoi de plusieurs gigaoctets.
 *
 * Disposition sous [root] : `pending/<id>.json` (fiches), `media/<id>/` (copies), `quarantine/` (fiches
 * illisibles, conservées pour examen). Une fiche d'un schéma inconnu est ignorée sans suppression (une
 * version plus récente de l'app la lira) ; une fiche corrompue part en quarantaine.
 */
public class SharePendingShareStore(
    private val root: File,
    private val clock: () -> Long = System::currentTimeMillis,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : PerAccountCache {

    private val pendingDir get() = File(root, PENDING)
    private val quarantineDir get() = File(root, QUARANTINE)

    /** Le dossier des copies de ce partage (créé à la demande par l'appelant). */
    public fun mediaDirectory(shareId: String): File = File(File(root, MEDIA), safe(shareId))

    /**
     * Le SEUL point d'écriture. Une fiche entièrement servie est supprimée avec son dossier de copies ;
     * toute autre est réécrite atomiquement.
     */
    public suspend fun commit(share: SharePendingShare): Unit = withContext(ioDispatcher) {
        if (share.isFullyServed) {
            discardBlocking(share.clientMessageId)
            return@withContext
        }
        pendingDir.mkdirs()
        val atomic = AtomicFile(fileFor(share.clientMessageId))
        val out = atomic.startWrite()
        try {
            out.write(SharePendingShareCodec.encode(share).toByteArray(Charsets.UTF_8))
            atomic.finishWrite(out)
        } catch (failure: IOException) {
            atomic.failWrite(out)
            throw failure
        }
    }

    /** La fiche de [shareId] si elle est lisible, vivante et servie à [accountId]. */
    public suspend fun load(shareId: String, accountId: String?): SharePendingShare? =
        pending(accountId).firstOrNull { it.clientMessageId == shareId }

    /**
     * Les fiches à reprendre pour [accountId], les plus anciennes d'abord. Balaie au passage les fiches
     * expirées (avec leur dossier de copies) et met les fiches corrompues en quarantaine.
     */
    public suspend fun pending(accountId: String?): List<SharePendingShare> = withContext(ioDispatcher) {
        val now = clock()
        pendingDir.listFiles { f -> f.isFile && f.name.endsWith(SUFFIX) }.orEmpty()
            .mapNotNull { readOrSweep(it, now) }
            .filter { it.isServedTo(accountId) }
            .sortedBy { it.createdAt }
    }

    public suspend fun discard(shareId: String): Unit = withContext(ioDispatcher) { discardBlocking(shareId) }

    /** Déconnexion : fiches, copies et quarantaine, tout part. Idempotent. */
    override suspend fun clear() {
        withContext(ioDispatcher) { root.deleteRecursively() }
    }

    private fun readOrSweep(file: File, now: Long): SharePendingShare? {
        val text = runCatching { AtomicFile(file).readFully().toString(Charsets.UTF_8) }.getOrNull()
        if (text == null) {
            quarantine(file)
            return null
        }
        return when (val decoded = SharePendingShareCodec.decode(text)) {
            is SharePendingShareCodec.Decoded.UnknownVersion -> null
            SharePendingShareCodec.Decoded.Corrupt -> {
                quarantine(file)
                null
            }
            is SharePendingShareCodec.Decoded.Readable -> decoded.share.takeUnless { share ->
                share.isExpired(now).also { if (it) discardBlocking(share.clientMessageId) }
            }
        }
    }

    private fun quarantine(file: File) {
        quarantineDir.mkdirs()
        val target = File(quarantineDir, file.name + "." + clock())
        if (!file.renameTo(target)) file.delete()
    }

    private fun discardBlocking(shareId: String) {
        val atomic = AtomicFile(fileFor(shareId))
        atomic.delete()
        mediaDirectory(shareId).deleteRecursively()
    }

    private fun fileFor(shareId: String): File = File(pendingDir, SharePendingShare.fileName(safe(shareId)))

    private fun safe(shareId: String): String = shareId.replace(UNSAFE, "_")

    private companion object {
        private const val PENDING = "pending"
        private const val MEDIA = "media"
        private const val QUARANTINE = "quarantine"
        private const val SUFFIX = ".json"
        private val UNSAFE = Regex("[^A-Za-z0-9_-]")
    }
}
