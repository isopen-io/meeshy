package me.meeshy.sdk.model.mood

import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/** Les règles de la page plein écran d'une humeur (iOS `MoodSpotlightViewModel`). */
object MoodSpotlightRules {

    /** Une humeur dont l'expiration est passée n'est plus montrée ; sans expiration, elle vit. */
    fun isLive(entry: StatusEntry, nowMillis: Long): Boolean =
        isoToEpochMillisOrNull(entry.expiresAt)?.let { it > nowMillis } ?: true

    /** On ne répond pas à sa propre humeur, ni à une humeur absente. */
    fun canReply(entry: StatusEntry?, currentUserId: String?): Boolean =
        entry != null && entry.userId != currentUserId

    fun canSend(canReply: Boolean, isSending: Boolean, text: String): Boolean =
        canReply && !isSending && text.isNotBlank()
}
