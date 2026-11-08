package me.meeshy.sdk.conversation

import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.outbox.ConversationPrefsPrevious

/** L'état à restaurer si la file abandonne l'instantané que l'on s'apprête à écrire. */
internal fun ApiConversationPreferences.toPrevious(): ConversationPrefsPrevious = ConversationPrefsPrevious(
    baseVersion = version,
    isPinned = isPinned,
    isMuted = isMuted,
    isArchived = isArchived,
    mentionsOnly = mentionsOnly,
    categoryId = categoryId,
    customName = customName,
    reaction = reaction,
    tags = tags,
)

internal fun ApiConversationPreferences.restoring(previous: ConversationPrefsPrevious): ApiConversationPreferences = copy(
    isPinned = previous.isPinned,
    isMuted = previous.isMuted,
    isArchived = previous.isArchived,
    mentionsOnly = previous.mentionsOnly,
    categoryId = previous.categoryId,
    customName = previous.customName,
    reaction = previous.reaction,
    tags = previous.tags ?: tags,
)
