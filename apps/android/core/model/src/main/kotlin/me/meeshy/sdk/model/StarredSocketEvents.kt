package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * `message:starred` — l'état de l'étoile PERSONNELLE du destinataire après écriture
 * (`packages/shared/types/socketio-events/message.ts`, `MessageStarredEventData`).
 * [starredAt] (ISO 8601) est la date de pose, `null` quand [starred] vaut `false`.
 */
@Serializable
public data class MessageStarredEvent(
    val messageId: String,
    val conversationId: String,
    val starred: Boolean,
    val starredAt: String? = null,
)
