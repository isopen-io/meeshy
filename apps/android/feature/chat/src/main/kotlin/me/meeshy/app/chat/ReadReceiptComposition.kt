package me.meeshy.app.chat

import me.meeshy.sdk.lang.ReadReceiptLanguages
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.outbox.ReadReceiptPayload

/**
 * Compose ce que l'accusé de lecture DÉCLARE : les messages non lus des autres et la langue dans laquelle le
 * lecteur les avait sous les yeux (bascule manuelle, prisme, original). Résolu ICI, à la composition — la file
 * peut partir longtemps après, et une traduction arrivée entre-temps ne change pas ce qui a été lu.
 */
internal object ReadReceiptComposition {

    /**
     * @param window le fil chargé, du plus ancien au plus récent ; les [unreadCount] derniers messages des
     *   AUTRES en sont les non lus. [arrived] est le `message:new` qui déclenche l'accusé, pas forcément déjà
     *   dans la fenêtre. `null` quand il n'y a rien à nommer : l'accusé reste alors celui de la conversation.
     */
    fun declaration(
        window: List<ApiMessage>,
        ownUserId: String?,
        unreadCount: Int,
        arrived: ApiMessage?,
        prism: List<String>,
        overrides: Map<String, String>,
        showingOriginal: Set<String>,
    ): ReadReceiptPayload? {
        val unread = window.asReversed().asSequence()
            .filter { it.senderId != ownUserId }
            .take(unreadCount.coerceAtLeast(0))
            .toList()
            .asReversed()
        val read = if (arrived != null && arrived.senderId != ownUserId && unread.none { it.id == arrived.id }) {
            unread + arrived
        } else {
            unread
        }
        if (read.isEmpty()) return null
        val manual = read.mapNotNull { message ->
            val chosen = overrides[message.id]
                ?: message.originalLanguage?.takeIf { message.id in showingOriginal }
            chosen?.let { message.id to it }
        }.toMap()
        val declared = ReadReceiptLanguages.declare(read, prism, manual)
        if (declared.messageIds.isEmpty()) return null
        return ReadReceiptPayload(
            messageIds = declared.messageIds,
            language = declared.language,
            messageLanguages = declared.messageLanguages.takeIf { it.isNotEmpty() },
            caughtUpToMessageId = declared.caughtUpToMessageId,
        )
    }
}
