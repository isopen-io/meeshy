package me.meeshy.sdk.media

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import me.meeshy.core.crypto.primitives.StreamingSeal
import me.meeshy.core.database.dao.MediaBlobDao
import me.meeshy.core.database.entity.MediaBlobEntity
import me.meeshy.sdk.session.AccountClosedException
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.PerAccountCache
import timber.log.Timber
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Durable store for the octets of queued media uploads (ARCHITECTURE.md §5; ADR-006) — the producer half of the
 * durable upload→publish chain.
 *
 * The shared outbox carries a `String` payload, so an `UPLOAD_MEDIA` row keeps its octets here, keyed by that row's
 * `cmid`. The `MEDIA`-lane sender reads the blob back, uploads it, and [remove]s it once delivered — so a media
 * attachment queued **fully offline** survives process death and uploads when connectivity returns.
 *
 * **The octets live in a sealed file, never in the row** (#13551, [MediaBlobFiles]): the row keeps the name, the
 * type and an EMPTY `bytes` column, and [get] hands back an item that STREAMS from the file, whatever its size. A row
 * written before (its `bytes` column filled) is still delivered as it is — the stores of an updated app keep working.
 * The file is written BEFORE the row, so a row never exists without its octets.
 *
 * A stateless building block: it persists and returns exactly the [MediaUploadItem] the uploader consumes. The
 * "when to enqueue / when to upload" decisions belong to the product layer, not here.
 */
@Singleton
class MediaBlobStore internal constructor(
    private val mediaBlobDao: MediaBlobDao,
    private val files: MediaBlobFiles,
    private val io: CoroutineDispatcher = Dispatchers.IO,
    private val fence: AccountFence? = null,
) : PerAccountCache {

    @Inject
    constructor(mediaBlobDao: MediaBlobDao, @ApplicationContext context: Context, fence: AccountFence) :
        this(mediaBlobDao, MediaBlobFiles(File(context.noBackupFilesDir, DIRECTORY)) { keystoreSeal(context) }, Dispatchers.IO, fence)

    /**
     * Persists [item]'s octets under [cmid] for the account of [ticket] (the account the user acted under, taken when
     * the write began), replacing any previous blob for it. The sealed file is bound to that account; its row is only
     * written while that account is still signed in (#13555) — otherwise the file just written leaves the disk and
     * [AccountClosedException] is thrown: a blob never outlives, nor changes, its account.
     */
    suspend fun put(cmid: String, item: MediaUploadItem, ticket: AccountTicket? = ticket()) {
        try {
            withContext(io) { files.write(cmid, item.source, ticket?.ownerId) }
        } catch (failure: Exception) {
            if (failure is CancellationException || ticket == null || fence?.isCurrent(ticket) != false) throw failure
            withContext(NonCancellable + io) { files.delete(cmid) }
            throw AccountClosedException()
        }
        val row = MediaBlobEntity(cmid = cmid, bytes = EMPTY, fileName = item.fileName, mimeType = item.mimeType, createdAt = now())
        if (fence == null || ticket == null) {
            mediaBlobDao.upsert(row)
            return
        }
        fence.commit(ticket) { mediaBlobDao.upsert(row) } ?: run {
            withContext(NonCancellable + io) { files.delete(cmid) }
            throw AccountClosedException()
        }
    }

    /**
     * The stored upload for [cmid] as [ownerId]'s account queued it, or `null` when no blob is held for it, its sealed
     * file no longer opens, or it was queued by another account.
     */
    suspend fun get(cmid: String, ownerId: String? = currentOwner()): MediaUploadItem? {
        val row = mediaBlobDao.find(cmid) ?: return null
        if (row.bytes.isNotEmpty()) return MediaUploadItem(bytes = row.bytes, fileName = row.fileName, mimeType = row.mimeType)
        val source = withContext(io) { files.source(cmid, ownerId) } ?: return null
        return MediaUploadItem(source = source, fileName = row.fileName, mimeType = row.mimeType)
    }

    /**
     * Whether a blob is still held for [cmid] — a cheap existence check that never loads the octets, so an
     * availability probe over many queued uploads (the story draft restore reconciler) costs a boolean per id.
     */
    suspend fun has(cmid: String): Boolean = mediaBlobDao.exists(cmid)

    /** The account a write begun now belongs to (#13555) — `null` when this store is not fenced. */
    fun ticket(): AccountTicket? = fence?.ticket()

    /** The boot sweep (#13555): sealed files no row names, and half-written ones, left by a process that died before [before]. */
    suspend fun sweepOrphans(before: Long) {
        val held = mediaBlobDao.cmids().toSet()
        withContext(io) { files.sweep(held, before) }
    }

    /** Drops the blob for [cmid] (delivered, or its chain abandoned). No-op if absent. */
    suspend fun remove(cmid: String) {
        mediaBlobDao.delete(cmid)
        withContext(io) { files.delete(cmid) }
    }

    /** The account boundary: every sealed file leaves with the rows `clearAllTables` drops. */
    override suspend fun clear() {
        withContext(io) { files.clear() }
    }

    private fun now(): Long = System.currentTimeMillis()

    private fun currentOwner(): String? = ticket()?.ownerId

    internal companion object {
        const val DIRECTORY = "media-outbox"
        private val EMPTY = ByteArray(0)

        /**
         * The Keystore-held key; without a usable Keystore, a key held in memory only — what it seals is lost with the
         * process (the upload then reads as gone), never written in the clear.
         */
        fun keystoreSeal(context: Context): StreamingSeal = runCatching {
            StreamingSeal.androidKeystore(context, "media_outbox_keyset", "meeshy_media_outbox_keys", "meeshy_media_outbox_master")
        }.getOrElse { failure ->
            Timber.w(failure, "Media outbox: Keystore unusable, queued uploads will not survive the process")
            StreamingSeal.ephemeral()
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface MediaBlobStoreTeardownModule {
    @Binds
    @IntoSet
    fun mediaBlobStoreTeardown(store: MediaBlobStore): PerAccountCache
}
