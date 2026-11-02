package me.meeshy.sdk.conversation

import kotlinx.coroutines.CancellationException
import me.meeshy.core.database.dao.OutboxDao
import me.meeshy.sdk.model.PendingMessageMutations
import me.meeshy.sdk.outbox.OutboxKind

/** La lecture de l'outbox a échoué : la garde anti-écrasement ne peut pas être établie. */
internal class PendingOutboxReadException(cause: Throwable) :
    IllegalStateException("Pending outbox lookup failed: a message snapshot cannot be merged safely", cause)

/**
 * Quels messages portent une mutation encore dans l'outbox (miroir de `PendingOutboxLookup`, iOS).
 *
 * Un instantané serveur s'en sert pour ne pas annuler une édition, une suppression, une réaction
 * ou un épinglage que la passerelle n'a pas encore reçus. Rendre un ensemble VIDE désactiverait
 * donc la garde — l'édition reviendrait, la suppression ressusciterait, la réaction clignoterait —
 * si bien qu'un échec de lecture n'est JAMAIS une liste vide silencieuse : il lève
 * [PendingOutboxReadException], et l'écriture de l'instantané est abandonnée (le cache reste tel quel).
 */
internal class PendingOutboxGuard(private val outboxDao: OutboxDao) {

    /** L'instantané des mutations en attente ; à lire dans la transaction qui fusionne. */
    suspend fun load(): PendingMessageMutations = try {
        PendingMessageMutations(
            edits = targets(OutboxKind.EDIT_MESSAGE),
            deletes = targets(OutboxKind.DELETE_MESSAGE),
            reactions = targets(OutboxKind.ADD_REACTION, OutboxKind.REMOVE_REACTION),
            pins = targets(OutboxKind.PIN_MESSAGE, OutboxKind.UNPIN_MESSAGE),
        )
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Exception) {
        throw PendingOutboxReadException(failure)
    }

    private suspend fun targets(vararg kinds: OutboxKind): Set<String> =
        outboxDao.pendingTargets(kinds.map { it.name }).toSet()
}
