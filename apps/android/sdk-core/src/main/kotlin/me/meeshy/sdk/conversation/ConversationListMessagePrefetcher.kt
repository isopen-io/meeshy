package me.meeshy.sdk.conversation

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.chat.HeldMessageWindow
import me.meeshy.sdk.model.chat.MessagePrefetchPlan
import me.meeshy.sdk.model.chat.PrefetchCandidate
import timber.log.Timber

/**
 * Une demande de passe : les lignes à servir, le compte qui la lance, et la question qu'elle
 * repose avant chaque requête et chaque écriture (garde de propriété du compte, #8651 iOS).
 */
class MessagePrefetchRequest(
    val candidates: List<PrefetchCandidate>,
    val ownerId: String,
    val stillOwner: () -> Boolean,
)

/** La page la plus récente d'une conversation, demandée sous le jeton COURANT. */
interface MessagePrefetchPageSource {
    /** `null` sur tout échec (réseau, enveloppe refusée) : la passe suivante retente. */
    suspend fun fetchLatestPage(conversationId: String, limit: Int): List<ApiMessage>?
}

/** Ce que le préchargement lit et grave dans la base locale que le fil peint. */
interface MessagePrefetchStore {
    suspend fun heldWindow(conversationId: String, limit: Int): HeldMessageWindow

    /** Grave la page servie là où le fil la lit — `false` si rien n'a été écrit. */
    suspend fun persist(page: List<ApiMessage>, conversationId: String): Boolean
}

/**
 * **Le préchargement des messages des premières conversations de la liste** (miroir de
 * `ConversationListMessagePrefetcher.swift`, #10572) : ouvrir l'une d'elles ne doit jamais
 * attendre le réseau pour peindre ses derniers messages.
 *
 * Une passe à la fois : une demande qui arrive pendant une passe la suit, et la plus récente
 * remplace celle qui attendait. Au plus [MessagePrefetchPlan.MAX_CONCURRENT_FETCHES] requêtes
 * simultanées. Un échec n'entre pas au registre (compte + conversation -> dernier message
 * rapporté) : il est retenté à la passe suivante. Rien ne part ni ne s'écrit dès que le compte
 * lanceur n'est plus actif ou que son identifiant est vide.
 *
 * Le Prisme du lecteur n'est pas « gravé » ici : la ligne Room porte la charge serveur
 * entière (citations de réponses et traductions comprises), et le fil descend le Prisme à
 * l'affichage — il n'existe pas de texte résolu à figer dans la table.
 */
@Singleton
class ConversationListMessagePrefetcher @Inject constructor(
    private val source: MessagePrefetchPageSource,
    private val store: MessagePrefetchStore,
    @IoDispatcher dispatcher: CoroutineDispatcher,
) {
    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val lock = Any()
    private var inFlight: Job? = null
    private var pending: MessagePrefetchRequest? = null
    private val ledger = HashMap<String, String>()
    private var armedForNextReload = false

    fun schedule(request: MessagePrefetchRequest) {
        synchronized(lock) {
            if (inFlight != null) {
                pending = request
                return
            }
            run(request)
        }
    }

    /** La reconnexion rejoue la passe tout de suite PUIS au rechargement de liste qui suit. */
    fun armForNextReload() = synchronized(lock) { armedForNextReload = true }

    fun takeReloadArm(): Boolean = synchronized(lock) { armedForNextReload.also { armedForNextReload = false } }

    suspend fun waitUntilIdle() {
        while (true) {
            val job = synchronized(lock) { inFlight } ?: return
            job.join()
        }
    }

    private fun run(request: MessagePrefetchRequest) {
        val marks = HashMap(ledger)
        inFlight = scope.launch {
            val completed = try {
                pass(request, marks)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Timber.w(failure, "prefetch pass failed")
                emptyMap<String, String>()
            }
            finish(completed)
        }
    }

    private fun finish(completed: Map<String, String>) = synchronized(lock) {
        ledger.putAll(completed)
        inFlight = null
        val next = pending ?: return@synchronized
        pending = null
        run(next)
    }

    private suspend fun pass(request: MessagePrefetchRequest, marks: Map<String, String>): Map<String, String> {
        val completed = HashMap<String, String>()
        if (request.ownerId.isEmpty()) return completed
        for (batch in request.candidates.chunked(MessagePrefetchPlan.MAX_CONCURRENT_FETCHES)) {
            if (!request.stillOwner()) break
            val done = coroutineScope {
                batch.map { candidate ->
                    async {
                        val key = MessagePrefetchPlan.ledgerKey(request.ownerId, candidate.conversationId)
                        prefetch(candidate, request, marks[key])?.let { key to it }
                    }
                }.awaitAll()
            }
            done.filterNotNull().forEach { (key, mark) -> completed[key] = mark }
        }
        return completed
    }

    /** Le dernier message rapporté quand la page est GRAVÉE, `null` sinon (sautée, échec, compte quitté). */
    private suspend fun prefetch(
        candidate: PrefetchCandidate,
        request: MessagePrefetchRequest,
        prefetchedMark: String?,
    ): String? {
        if (!request.stillOwner()) return null
        val held = store.heldWindow(candidate.conversationId, MessagePrefetchPlan.PAGE_LIMIT)
        if (!MessagePrefetchPlan.needsPrefetch(candidate, held, prefetchedMark)) return null
        return try {
            val page = source.fetchLatestPage(candidate.conversationId, MessagePrefetchPlan.PAGE_LIMIT)
                ?: return null
            if (!request.stillOwner()) return null
            candidate.latestMark.takeIf { store.persist(page, candidate.conversationId) }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w(failure, "prefetch failed for %s", candidate.conversationId)
            null
        }
    }
}
