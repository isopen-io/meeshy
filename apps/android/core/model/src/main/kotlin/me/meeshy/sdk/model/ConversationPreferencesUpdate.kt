package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Partial update body for `PUT /user-preferences/conversations/:id` — only the
 * non-null fields are sent, so a single pin/mute/archive toggle never clobbers
 * the others (gateway `conversation-preferences.ts` supports partial updates).
 */
@Serializable
data class ConversationPreferencesUpdate(
    val isPinned: Boolean? = null,
    val isMuted: Boolean? = null,
    val isArchived: Boolean? = null,
)
