package me.meeshy.sdk.sync

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.model.sync.SyncConversationRow
import me.meeshy.sdk.model.sync.SyncResponse
import me.meeshy.sdk.net.ConditionalResult
import me.meeshy.sdk.net.api.SyncApi
import me.meeshy.sdk.net.api.syncConditionalResult

/** Ce que la synchro demande à `/sync` — les paramètres que la passerelle lit. */
data class SyncDeltaRequest(
    /** Le point de reprise : le dernier `checkpoint` reçu (ISO 8601). */
    val since: String,
    val scope: String? = null,
    /** Les champs que l'appelant LIT, forme `collection.champ` ; vide ⇒ la ligne entière. */
    val fields: List<String> = emptyList(),
    /** Le dernier `ETag` lu, pour que le 304 puisse tomber. */
    val validator: String? = null,
)

/** Les trois issues d'un appel — un 304 n'est jamais fondu dans une panne. */
sealed interface SyncDeltaOutcome {
    /** 304 : la fenêtre n'a pas bougé, rien à décoder, rien à avancer. */
    data object NotModified : SyncDeltaOutcome

    /**
     * La route n'a pas répondu utilement (404/501 d'un ancien serveur, refus, contrat illisible, réseau) :
     * l'appelant retombe sur `GET /conversations`, sans erreur visible et sans perdre son point de reprise.
     */
    data class Unavailable(val reason: String) : SyncDeltaOutcome

    data class Delta(
        val rows: List<SyncConversationRow>,
        val deletedIds: List<String>,
        val checkpoint: String?,
        /** Toutes les pages ont été lues et aucun trou : le checkpoint peut devenir le prochain `since`. */
        val complete: Boolean,
        val hasGap: Boolean,
        /** Valable seulement quand UNE page a suffi (l'ETag hache le corps exact de cette page). */
        val validator: String?,
    ) : SyncDeltaOutcome
}

/** La couture de test de [ConversationCacheSource] ; [None] est l'ancien serveur : jamais de `/sync`. */
fun interface SyncDeltaFetching {
    suspend fun conversationsDelta(request: SyncDeltaRequest): SyncDeltaOutcome

    companion object {
        val None: SyncDeltaFetching = SyncDeltaFetching { SyncDeltaOutcome.Unavailable("none") }
    }
}

/**
 * Le client `/sync` (miroir de `SyncDeltaClient` iOS) : pages d'ancre relayées verbatim, `truncated` honoré,
 * 304 sur validateur, `seq` annoncé (sans lui la passerelle ne calcule aucun trou).
 */
@Singleton
class SyncDeltaClient @Inject constructor(
    private val api: SyncApi,
    private val seq: SyncSeqTracker,
) : SyncDeltaFetching {

    override suspend fun conversationsDelta(request: SyncDeltaRequest): SyncDeltaOutcome {
        val rows = mutableListOf<SyncConversationRow>()
        val deleted = mutableListOf<String>()
        var cursor: String? = null
        var checkpoint: String? = null
        var hasGap = false
        var validator: String? = null
        var pages = 0
        while (pages < MAX_PAGES) {
            val result = try {
                api.syncConditionalResult(
                    since = request.since,
                    collections = SyncResponse.CONVERSATIONS,
                    scope = request.scope,
                    seq = seq.lastSeq,
                    cursor = cursor,
                    fields = request.fields.takeIf { it.isNotEmpty() }?.joinToString(","),
                    ifNoneMatch = if (pages == 0) request.validator else null,
                )
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (e: Exception) {
                return SyncDeltaOutcome.Unavailable(e.javaClass.simpleName)
            }
            val data = when (result) {
                is ConditionalResult.NotModified ->
                    return if (pages == 0 && request.validator != null) {
                        SyncDeltaOutcome.NotModified
                    } else {
                        SyncDeltaOutcome.Unavailable("unexpected-304")
                    }
                is ConditionalResult.Failure -> return SyncDeltaOutcome.Unavailable(result.error.code ?: "failure")
                is ConditionalResult.Fresh -> result
            }
            val response = data.data
            val page = response.conversations
            pages++
            if (pages == 1) validator = data.etag
            checkpoint = response.checkpoint ?: checkpoint
            hasGap = hasGap || response.hasGap
            if (page != null) {
                rows += page.rows
                deleted += page.deleted.map { it.id }
            }
            val next = page?.takeIf { it.truncated }?.nextCursor
            if (next == null) {
                return SyncDeltaOutcome.Delta(
                    rows = rows,
                    deletedIds = deleted,
                    checkpoint = checkpoint,
                    complete = !hasGap && page?.truncated != true,
                    hasGap = hasGap,
                    validator = validator.takeIf { pages == 1 },
                )
            }
            cursor = next
        }
        return SyncDeltaOutcome.Delta(rows, deleted, checkpoint, complete = false, hasGap = hasGap, validator = null)
    }

    internal companion object {
        const val MAX_PAGES: Int = 20
    }
}
