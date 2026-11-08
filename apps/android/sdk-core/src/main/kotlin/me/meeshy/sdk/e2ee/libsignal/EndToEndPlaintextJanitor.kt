package me.meeshy.sdk.e2ee.libsignal

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.core.e2ee.open.E2eeOpenOutcome
import me.meeshy.sdk.e2ee.PlaintextErasureLedger
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocketManager
import timber.log.Timber

/** Ce que le concierge demande au coffre : retirer des clés, ou une conversation jusqu'à une borne. Rend `false` sur un échec. */
internal interface PlaintextVaultEraser {
    suspend fun erase(account: String, messageIds: Collection<String>): Boolean
    suspend fun eraseConversation(account: String, conversationId: String, composedUpTo: Long): Boolean
}

/**
 * **Vide la file durable des clairs effacés** (#14655, miroir de `EndToEndPlaintextJanitor`, iOS #13001) pour le seul
 * compte de la session : à l'ouverture de session, à chaque inscription (la file est observée), à chaque reconnexion —
 * une inscription qu'un coffre verrouillé (#14634) a refusée attend la suivante. Une inscription n'est acquittée qu'une
 * fois le coffre d'accord.
 *
 * Et chaque enveloppe ouverte APRÈS l'effacement de son message (ou de sa conversation) voit son clair repartir aussitôt
 * ([reconsider], iOS `reconsider`). Journal : jamais d'identifiant, des classes d'erreur.
 */
@Singleton
internal class EndToEndPlaintextJanitor internal constructor(
    private val ledger: PlaintextErasureLedger,
    private val vault: PlaintextVaultEraser,
    private val account: () -> String?,
    private val opened: Flow<E2eeOpenOutcome>,
    private val reconnections: Flow<Unit>,
    private val scope: CoroutineScope,
) : RealtimeBinding {

    @Inject
    constructor(ledger: PlaintextErasureLedger, runtime: EndToEndMessagingRuntime, session: SessionRepository, socket: SocketManager) : this(
        ledger,
        RuntimeVaultEraser(runtime),
        { session.currentUserId },
        runtime.opened,
        socket.connected,
        CoroutineScope(SupervisorJob() + Dispatchers.IO),
    )

    private val draining = Mutex()
    private var jobs: List<Job> = emptyList()

    override fun attach() {
        detach()
        jobs = listOf(
            scope.launch { ledger.observePendingCount().collect { if (it > 0) guarded { drain() } } },
            scope.launch { reconnections.collect { guarded { drain() } } },
            scope.launch { opened.collect { if (it is E2eeOpenOutcome.Opened) guarded { reconsider(it) } } },
        )
    }

    override fun detach() {
        jobs.forEach { it.cancel() }
        jobs = emptyList()
    }

    /** Retire du coffre chaque inscription en attente ; rend `false` quand le coffre en a refusé une (elle attend). */
    suspend fun drain(): Boolean = draining.withLock {
        val owner = account()?.takeIf { it.isNotBlank() } ?: return@withLock false
        var outcome = drainBatch(owner)
        while (outcome == Batch.MORE) outcome = drainBatch(owner)
        outcome == Batch.DONE
    }

    private suspend fun drainBatch(owner: String): Batch {
        val batch = ledger.pending(owner, BATCH)
        if (batch.isEmpty()) return Batch.DONE
        val (conversations, messages) = batch.partition { it.conversationId != null }
        val keys = messages.flatMap { it.messageKeys(owner) }.distinct()
        val messagesErased = keys.isEmpty() || vault.erase(owner, keys)
        val conversationsErased = conversations.filter { vault.eraseConversation(owner, it.conversationId.orEmpty(), it.row.recordedAt) }
        ledger.acknowledge(owner, (if (messagesErased) messages else emptyList()) + conversationsErased)
        return when {
            !messagesErased || conversationsErased.size < conversations.size -> Batch.BLOCKED
            batch.size < BATCH -> Batch.DONE
            else -> Batch.MORE
        }
    }

    private enum class Batch { DONE, MORE, BLOCKED }

    /** Une enveloppe ouverte après l'effacement de son message : son clair, tout juste rangé, repart. */
    suspend fun reconsider(opened: E2eeOpenOutcome.Opened) {
        val owner = account()?.takeIf { it.isNotBlank() } ?: return
        if (ledger.wasErased(owner, opened.messageId, opened.conversationId, opened.content.sentAt)) {
            vault.erase(owner, listOf(opened.messageId))
        }
    }

    private suspend fun guarded(block: suspend () -> Unit) {
        try {
            block()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w("e2ee plaintext erasures deferred: %s", failure.javaClass.simpleName)
        }
    }

    private class RuntimeVaultEraser(private val runtime: EndToEndMessagingRuntime) : PlaintextVaultEraser {
        override suspend fun erase(account: String, messageIds: Collection<String>): Boolean = runtime.erase(account, messageIds)

        override suspend fun eraseConversation(account: String, conversationId: String, composedUpTo: Long): Boolean =
            runtime.eraseConversation(account, conversationId, composedUpTo)
    }

    private companion object {
        const val BATCH = 500
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface EndToEndPlaintextJanitorModule {
    @Binds
    @IntoSet
    fun bindRealtime(janitor: EndToEndPlaintextJanitor): RealtimeBinding
}
