package me.meeshy.app.conversations

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.conversationlist.SectionableConversation
import me.meeshy.sdk.model.conversationlist.SectionableLiveCall
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * L'adaptateur `ApiConversation` -> conversation sectionnable de la loi de sections
 * (iOS `groupWithLentille`) : une épinglée sans catégorie flotte en tête, une épinglée rangée
 * garde sa catégorie ; seule la date du dernier message (repli `updatedAt`, puis `createdAt`)
 * date la conversation ; un appel en cours la range « En direct ».
 */
internal fun ApiConversation.toSectionable(callInProgress: Boolean = false): SectionableConversation {
    val prefs = resolvedPreferences
    val categoryId = prefs?.categoryId
    return SectionableConversation(
        id = id,
        isPinned = prefs?.isPinned == true && categoryId == null,
        categoryId = categoryId,
        orderInCategory = prefs?.orderInCategory?.toDouble(),
        lastMessageAtMillis = isoToEpochMillisOrNull(lastMessage?.createdAt),
        updatedAtMillis = isoToEpochMillisOrNull(updatedAt) ?: isoToEpochMillisOrNull(createdAt) ?: 0L,
        liveCall = if (callInProgress) SectionableLiveCall else null,
    )
}
