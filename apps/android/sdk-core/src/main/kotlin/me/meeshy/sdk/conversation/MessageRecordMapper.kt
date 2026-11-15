package me.meeshy.sdk.conversation

import kotlinx.serialization.decodeFromString
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.MeeshyApi

/**
 * The single mapper from a stored row to the domain message.
 *
 * `payload` carries every block the gateway served; the columns only overlay what this device
 * knows and the server does not: the view-once the reader already opened, the retry counter, the
 * last error. The Prisme Linguistique is applied at the read ([LocalMessage.displayContent] →
 * `LanguageResolver.preferredTranslation`): the original when no translation matches the reader's
 * languages, never `translations.first()`.
 *
 * Decoding a payload is the expensive step of a list refresh, so the result is memoized per
 * row (identity, `changeVersion`, payload): a row nobody wrote since the last read is not decoded again.
 */
internal object MessageRecordMapper {

    private const val CAPACITY = 512

    /** Keyed by the whole row: its `changeVersion` moves with every local write, its payload with every server one. */
    private val memo = object : LinkedHashMap<MessageEntity, LocalMessage>(CAPACITY, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<MessageEntity, LocalMessage>): Boolean =
            size > CAPACITY
    }

    fun map(row: MessageEntity): LocalMessage {
        synchronized(memo) { memo[row] }?.let { return it }
        return decode(row).also { synchronized(memo) { memo[row] = it } }
    }

    private fun decode(row: MessageEntity): LocalMessage {
        val decoded = MeeshyApi.json.decodeFromString<ApiMessage>(row.payload)
        val message = if (row.viewOnceOpenedAt != null && decoded.consumedByMe != true) {
            decoded.copy(consumedByMe = true)
        } else {
            decoded
        }
        return LocalMessage(
            message = message,
            sendState = row.sendState?.let { LocalSendState.valueOf(it) } ?: LocalSendState.SYNCED,
            retryCount = row.retryCount,
            lastError = row.lastError,
        )
    }
}
