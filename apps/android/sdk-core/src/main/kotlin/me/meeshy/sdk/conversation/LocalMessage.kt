package me.meeshy.sdk.conversation

import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage

/** Delivery progress of a message row as known locally (ARCHITECTURE.md §5). */
public enum class LocalSendState {
    /** Server-acked — the row came from (or was confirmed by) the gateway. */
    SYNCED,

    /** Optimistic local row, queued or in flight in the outbox. */
    SENDING,

    /** The outbox gave up — the user can retry. */
    FAILED,
}

/**
 * A message plus its local delivery state. UI layers render [message] exactly
 * like a server message; [sendState] only drives the status indicator.
 *
 * [retryCount] and [lastError] belong to this device (the outbox attempts) and survive a REST refresh.
 */
public data class LocalMessage(
    val message: ApiMessage,
    val sendState: LocalSendState = LocalSendState.SYNCED,
    val retryCount: Int = 0,
    val lastError: String? = null,
) {
    /** The text to show under the Prisme Linguistique: the original when no translation matches. */
    public fun displayContent(prefs: LanguageResolver.ContentLanguagePreferences): String =
        message.displayContent(prefs)
}

/** Decodes a cached [MessageEntity] row into its domain [LocalMessage] — the one
 * decode path shared by [MessageCacheSource] and [MessageRepository.recentMessages]. */
internal fun MessageEntity.toLocalMessage(): LocalMessage = MessageRecordMapper.map(this)
