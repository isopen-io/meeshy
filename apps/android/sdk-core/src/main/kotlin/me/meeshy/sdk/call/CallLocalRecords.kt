package me.meeshy.sdk.call

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import me.meeshy.core.crypto.primitives.StreamingSeal
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.SealedDocumentStore
import me.meeshy.sdk.model.call.CallNetworkEvent
import me.meeshy.sdk.model.call.CallNetworkJournal
import me.meeshy.sdk.model.call.CallTranscriptPage
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.PerAccountCache
import timber.log.Timber

/**
 * The key that seals what a call leaves on this device (transcript copies, network journals) — ONE keyset, created
 * once, so two stores never race to create two. Without a usable Keystore, a key held in memory only: the records are
 * then lost with the process, never written in the clear.
 */
@Singleton
class CallRecordsSeal @Inject constructor(@ApplicationContext private val context: Context) {
    val seal: StreamingSeal by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        runCatching {
            StreamingSeal.androidKeystore(context, "call_records_keyset", "meeshy_call_records_keys", "meeshy_call_records_master")
        }.getOrElse { failure ->
            Timber.w(failure, "Call records: Keystore unusable, transcripts and journals will not survive the process")
            StreamingSeal.ephemeral()
        }
    }

    /** A store under `noBackupFilesDir` — never in a device backup, unlike the iOS copy. */
    fun documents(directory: String, domain: String, policy: CachePolicy): SealedDocumentStore =
        SealedDocumentStore(File(context.noBackupFilesDir, directory), domain, policy, { seal })
}

/** What the device holds of a call's transcript. */
sealed interface CachedCallTranscript {
    data object None : CachedCallTranscript
    data class Copy(val page: CallTranscriptPage) : CachedCallTranscript

    /** The reader deleted it here: it is not shown again, nor fetched again, on this device. */
    data object Dismissed : CachedCallTranscript
}

@Serializable
internal data class CallTranscriptDocument(val page: CallTranscriptPage? = null, val dismissedAtMs: Long? = null)

/**
 * The encrypted copy of call transcripts (#13677) — port of iOS `CallTranscriptStore`: read first so a transcript
 * opens instantly and offline, revalidated by the server replay. Bounded by [CachePolicy.CallTranscripts] (90 days,
 * 1 000 calls), bound to the account and purged with it.
 *
 * Deleting is local: the gateway keeps the call's journal for its participants and has no route to erase it. So the
 * deletion leaves a TOMBSTONE, and a later replay never re-seeds a transcript the reader removed from this device.
 */
@Singleton
class CallTranscriptCache internal constructor(
    private val documents: SealedDocumentStore,
    private val owner: () -> String?,
    private val io: CoroutineDispatcher,
) : PerAccountCache {

    @Inject
    constructor(seal: CallRecordsSeal, fence: AccountFence) :
        this(seal.documents("call-transcripts", "meeshy.call-transcript.v1", CachePolicy.CallTranscripts), { fence.ticket().ownerId }, Dispatchers.IO)

    private val mutex = Mutex()

    suspend fun cached(callId: String): CachedCallTranscript = guarded { read(callId).let(::shape) }

    /** Keeps [page] as the copy of [callId] — never over a tombstone. */
    suspend fun store(callId: String, page: CallTranscriptPage) = guarded {
        if (read(callId)?.dismissedAtMs != null) return@guarded
        documents.write(callId, CallTranscriptDocument(page = page), CallTranscriptDocument.serializer(), owner())
    }

    /** The server no longer serves it (empty, refused, unknown, sealed): the copy goes. */
    suspend fun drop(callId: String) = guarded {
        if (read(callId)?.dismissedAtMs == null) documents.remove(callId)
    }

    /** The reader deleted it on this device. */
    suspend fun dismiss(callId: String) = guarded {
        documents.write(callId, CallTranscriptDocument(dismissedAtMs = System.currentTimeMillis()), CallTranscriptDocument.serializer(), owner())
    }

    override suspend fun clear() = guarded { documents.clear() }

    private fun read(callId: String): CallTranscriptDocument? =
        if (callId.isBlank()) null else documents.read(callId, CallTranscriptDocument.serializer(), owner())

    private fun shape(document: CallTranscriptDocument?): CachedCallTranscript = when {
        document == null -> CachedCallTranscript.None
        document.dismissedAtMs != null -> CachedCallTranscript.Dismissed
        document.page != null -> CachedCallTranscript.Copy(document.page)
        else -> CachedCallTranscript.None
    }

    private suspend fun <T> guarded(block: suspend () -> T): T = withContext(io) { mutex.withLock { block() } }
}

/**
 * The network and quality journal of each call, on THIS device only (#13676) — port of iOS `CallNetworkJournalStore`:
 * never a network call. Bounded twice: per call by [CallNetworkJournal.EVENT_CEILING], across calls by
 * [CachePolicy.CallNetworkJournals] (30 days, 200 calls); encrypted at rest, bound to the account and purged with it.
 * The journal of the call in progress is kept in memory and merged once with what a previous process persisted for
 * the same call (a rejoin after a crash).
 */
@Singleton
class CallNetworkJournalStore internal constructor(
    private val documents: SealedDocumentStore,
    private val owner: () -> String?,
    private val io: CoroutineDispatcher,
) : PerAccountCache {

    @Inject
    constructor(seal: CallRecordsSeal, fence: AccountFence) :
        this(seal.documents("call-network-journals", "meeshy.call-network-journal.v1", CachePolicy.CallNetworkJournals), { fence.ticket().ownerId }, Dispatchers.IO)

    private val mutex = Mutex()
    private var live: Map<String, CallNetworkJournal> = emptyMap()

    suspend fun append(events: List<CallNetworkEvent>, callId: String, startedAtMs: Long) {
        if (events.isEmpty() || callId.isBlank()) return
        locked {
            val current = live[callId]
            val next = if (current != null) {
                events.fold(current) { journal, event -> journal.appending(event) }
            } else {
                val fresh = CallNetworkJournal(callId, startedAtMs, CallNetworkJournal.bounded(events))
                stored(callId)?.merging(fresh) ?: fresh
            }
            live = mapOf(callId to next)
            documents.write(callId, next, CallNetworkJournal.serializer(), owner())
        }
    }

    suspend fun journal(callId: String): CallNetworkJournal? = if (callId.isBlank()) null else locked { stored(callId) }

    suspend fun remove(callId: String) = locked {
        live = live - callId
        documents.remove(callId)
    }

    override suspend fun clear() = locked {
        live = emptyMap()
        documents.clear()
    }

    private fun stored(callId: String): CallNetworkJournal? = documents.read(callId, CallNetworkJournal.serializer(), owner())

    private suspend fun <T> locked(block: () -> T): T = withContext(io) { mutex.withLock { block() } }
}

/** Transcript copies and network journals are per account: [me.meeshy.sdk.session.SessionTeardown] clears them. */
@Module
@InstallIn(SingletonComponent::class)
internal abstract class CallLocalRecordsAccountCacheModule {
    @Binds
    @IntoSet
    abstract fun bindTranscriptCache(cache: CallTranscriptCache): PerAccountCache

    @Binds
    @IntoSet
    abstract fun bindNetworkJournalStore(store: CallNetworkJournalStore): PerAccountCache
}
