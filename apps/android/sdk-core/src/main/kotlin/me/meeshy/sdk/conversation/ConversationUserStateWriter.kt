package me.meeshy.sdk.conversation

import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.friend.OutboxFlushScheduler
import me.meeshy.sdk.model.UserStateMutation
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

/** Ce qu'un geste sur l'état d'une conversation a fait. */
sealed interface UserStateWrite {
    /** La ligne est déjà à jour ; le geste attend (ou voyage) dans la file. */
    data object Queued : UserStateWrite

    /** Rien à faire : l'état voulu est déjà celui de la ligne. */
    data object Unchanged : UserStateWrite

    /** Le geste ne concerne que cet appareil (verrou) : il n'est jamais mis en file ni envoyé. */
    data object LocalOnly : UserStateWrite

    /** Le serveur l'a pris en compte immédiatement (quitter, supprimer pour soi). */
    data object Sent : UserStateWrite

    /** Aucune voie d'écriture n'existe encore pour ce geste sur Android. */
    data object Unsupported : UserStateWrite

    data class Failed(val message: String?) : UserStateWrite
}

/**
 * Le point d'entrée UNIQUE des gestes sur l'état d'une conversation (miroir de `ConversationStore.apply` d'iOS) :
 * chaque [UserStateMutation] est appliquée à la ligne AVANT la confirmation réseau (optimiste), puis mise en file
 * (rejouée dans l'ordre hors ligne, fusionnée par le coalesceur) ; l'abandon de la file la restaure
 * (`UpdateConversationPrefsHandler.onExhausted`). [UserStateMutation.SetLocked] reste local, et
 * [UserStateMutation.DeleteForUser] / [UserStateMutation.Leave] sont des appels confirmés, jamais fusionnés.
 */
class ConversationUserStateWriter @Inject constructor(
    private val repository: ConversationRepository,
    private val flushScheduler: OutboxFlushScheduler,
) {

    suspend fun apply(conversationId: String, mutation: UserStateMutation): UserStateWrite =
        try {
            dispatch(conversationId, mutation)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            UserStateWrite.Failed(e.message)
        }

    private suspend fun dispatch(id: String, mutation: UserStateMutation): UserStateWrite = when (mutation) {
        is UserStateMutation.SetLocked -> UserStateWrite.LocalOnly
        is UserStateMutation.SetOrderInCategory, is UserStateMutation.SetClearHistoryBefore -> UserStateWrite.Unsupported
        UserStateMutation.DeleteForUser -> confirmed(repository.deleteForMe(id))
        UserStateMutation.Leave -> confirmed(repository.leave(id))
        else -> queued { queue(id, mutation) }
    }

    private suspend fun queue(id: String, mutation: UserStateMutation): Boolean = when (mutation) {
        is UserStateMutation.SetPinned -> repository.setPinnedOptimistic(id, mutation.value)
        is UserStateMutation.SetMuted -> repository.setMutedOptimistic(id, mutation.value)
        is UserStateMutation.SetMentionsOnly -> repository.setMentionsOnlyOptimistic(id, mutation.value)
        is UserStateMutation.SetArchived -> repository.setArchivedOptimistic(id, mutation.value)
        is UserStateMutation.SetCustomName -> repository.setCustomNameOptimistic(id, mutation.value.orEmpty())
        is UserStateMutation.SetReaction -> repository.setReactionOptimistic(id, mutation.value)
        is UserStateMutation.SetSection -> repository.setCategoryOptimistic(id, mutation.categoryId)
        is UserStateMutation.SetTags -> repository.setTagsOptimistic(id, mutation.value)
        is UserStateMutation.AddTag -> repository.editTagsOptimistic(id) { (it + mutation.value).distinct() }
        is UserStateMutation.RemoveTag -> repository.editTagsOptimistic(id) { it - mutation.value }
        UserStateMutation.MarkAsRead -> repository.markReadOptimistic(id)
        UserStateMutation.MarkAsUnread -> repository.markUnreadOptimistic(id)
        else -> false
    }

    private suspend fun queued(write: suspend () -> Boolean): UserStateWrite =
        if (write()) {
            flushScheduler.schedule()
            UserStateWrite.Queued
        } else {
            UserStateWrite.Unchanged
        }

    private fun confirmed(result: NetworkResult<Unit>): UserStateWrite = when (result) {
        is NetworkResult.Success -> UserStateWrite.Sent
        is NetworkResult.Failure -> UserStateWrite.Failed(result.error.message)
    }
}
