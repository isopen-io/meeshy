package me.meeshy.sdk.model.connection

import me.meeshy.sdk.model.sync.OutboxNavigationSource
import me.meeshy.sdk.model.sync.OutboxUiIcon
import me.meeshy.sdk.model.sync.OutboxUiItem
import me.meeshy.sdk.model.syncpill.SyncPillLabels

enum class SyncPillEntryKind { OPERATION, ERROR, TYPING }

/**
 * Une rangée du carrousel de la pastille. [labelKey] est la clé iOS du libellé (`sync.pill.*`) ; une entrée de frappe
 * porte son libellé tout fait ([literalLabel], « @pseudo »). [retryOutboxId] n'est posé que sur un échec RELANÇABLE.
 */
data class SyncPillEntry(
    val id: String,
    val kind: SyncPillEntryKind,
    val labelKey: String?,
    val literalLabel: String?,
    val icon: OutboxUiIcon,
    val target: OutboxNavigationSource,
    val retryOutboxId: String? = null,
    val scale: Float = 1f,
) {
    val isError: Boolean get() = kind == SyncPillEntryKind.ERROR
    val isTyping: Boolean get() = kind == SyncPillEntryKind.TYPING

    companion object {
        /** La taille de la pastille pendant une frappe. */
        const val TYPING_SCALE: Float = 1.6f

        fun forOperation(item: OutboxUiItem): SyncPillEntry {
            val failed = item.status.isTerminal
            return SyncPillEntry(
                id = "op:${item.id}",
                kind = if (failed) SyncPillEntryKind.ERROR else SyncPillEntryKind.OPERATION,
                labelKey = SyncPillLabels.keyFor(item),
                literalLabel = null,
                icon = item.iconKind,
                target = item.source,
                retryOutboxId = item.id.takeIf { failed },
            )
        }

        fun forTyping(conversationId: String, username: String): SyncPillEntry = SyncPillEntry(
            id = "typing:$conversationId",
            kind = SyncPillEntryKind.TYPING,
            labelKey = null,
            literalLabel = "@$username",
            icon = OutboxUiIcon.TEXT,
            target = OutboxNavigationSource.Conversation(conversationId, null),
            scale = TYPING_SCALE,
        )
    }
}

/** Qui écrit, dans une conversation. */
data class SyncPillTyper(val conversationId: String, val username: String)
