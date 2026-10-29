package me.meeshy.sdk.conversation

import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.category.CategoryRepository
import me.meeshy.sdk.friend.OutboxFlushScheduler
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.conversationoptions.CategoryReassignment
import me.meeshy.sdk.model.conversationoptions.ConversationCategoryReassignment
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

/** What a preference write did: queued (the cache already shows it), changed nothing, or failed. */
sealed interface PreferenceWrite {
    data object Queued : PreferenceWrite
    data object Unchanged : PreferenceWrite
    data class Failed(val message: String?) : PreferenceWrite
}

/** What « create a category and file the conversation in it » did. */
sealed interface CategoryCreation {
    data object Ignored : CategoryCreation
    data class Assigned(val category: CategoryOption, val write: PreferenceWrite) : CategoryCreation
    data class Failed(val message: String?) : CategoryCreation
}

/**
 * The single writer of a user's per-conversation preferences (#13777) — shared by the
 * conversation-list menu and the Options of the conversation info, as iOS shares
 * `ConversationStore.apply` between them. Each write is the optimistic repository path
 * (Room row first, then a full snapshot on the outbox prefs lane, offline included); the
 * flusher is woken only when something was queued, and a failure is reported, never thrown.
 */
class ConversationPreferenceActions @Inject constructor(
    private val repository: ConversationRepository,
    private val categoryRepository: CategoryRepository,
    private val flushScheduler: OutboxFlushScheduler,
) {

    suspend fun setPinned(id: String, pinned: Boolean): PreferenceWrite = write { repository.setPinnedOptimistic(id, pinned) }

    suspend fun setMuted(id: String, muted: Boolean): PreferenceWrite = write { repository.setMutedOptimistic(id, muted) }

    suspend fun setMentionsOnly(id: String, mentionsOnly: Boolean): PreferenceWrite =
        write { repository.setMentionsOnlyOptimistic(id, mentionsOnly) }

    suspend fun setArchived(id: String, archived: Boolean): PreferenceWrite =
        write { repository.setArchivedOptimistic(id, archived) }

    suspend fun setCustomName(id: String, name: String): PreferenceWrite = write { repository.setCustomNameOptimistic(id, name) }

    suspend fun setReaction(id: String, emoji: String?): PreferenceWrite = write { repository.setReactionOptimistic(id, emoji) }

    suspend fun setTags(id: String, tags: List<String>): PreferenceWrite = write { repository.setTagsOptimistic(id, tags) }

    /** Files [id] in [targetCategoryId]; the category it already sits in is inert ([ConversationCategoryReassignment]). */
    suspend fun assignCategory(id: String, currentCategoryId: String?, targetCategoryId: String): PreferenceWrite =
        when (val outcome = ConversationCategoryReassignment.resolve(currentCategoryId, targetCategoryId)) {
            CategoryReassignment.Unchanged -> PreferenceWrite.Unchanged
            is CategoryReassignment.AssignTo -> write { repository.setCategoryOptimistic(id, outcome.categoryId) }
        }

    /** Creates the category [name] (trimmed; blank is inert) then files [id] in it. */
    suspend fun createCategoryAndAssign(id: String, currentCategoryId: String?, name: String): CategoryCreation {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return CategoryCreation.Ignored
        return when (val created = categoryRepository.create(trimmed)) {
            is NetworkResult.Success ->
                CategoryCreation.Assigned(created.data, assignCategory(id, currentCategoryId, created.data.id))
            is NetworkResult.Failure -> CategoryCreation.Failed(created.error.message)
        }
    }

    private suspend fun write(mutate: suspend () -> Boolean): PreferenceWrite =
        try {
            if (mutate()) {
                flushScheduler.schedule()
                PreferenceWrite.Queued
            } else {
                PreferenceWrite.Unchanged
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            PreferenceWrite.Failed(e.message)
        }
}
