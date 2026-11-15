package me.meeshy.sdk.model.connection

import me.meeshy.sdk.model.sync.OutboxNavigationSource
import me.meeshy.sdk.model.sync.OutboxUiIcon
import me.meeshy.sdk.model.sync.OutboxUiItem
import me.meeshy.sdk.model.syncpill.SyncPillGlyph
import me.meeshy.sdk.model.syncpill.SyncPillLabels

/** [ANNOUNCEMENT] : une annonce passagère (batterie d'un Proche, #14147) — jamais « en cours », jamais persistante. */
enum class SyncPillEntryKind { OPERATION, ERROR, TYPING, ANNOUNCEMENT }

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
    val glyph: SyncPillGlyph? = null,
) {
    val isError: Boolean get() = kind == SyncPillEntryKind.ERROR
    val isTyping: Boolean get() = kind == SyncPillEntryKind.TYPING
    val isAnnouncement: Boolean get() = kind == SyncPillEntryKind.ANNOUNCEMENT

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

        /**
         * Une annonce de batterie (#14147) : son libellé est déjà composé dans la langue de l'interface ([label]) ; [id]
         * est unique par annonce — la pastille ne la rejoue jamais, elle n'apparaît que sur un NOUVEL événement.
         */
        fun forAnnouncement(id: String, label: String, glyph: SyncPillGlyph): SyncPillEntry = SyncPillEntry(
            id = id,
            kind = SyncPillEntryKind.ANNOUNCEMENT,
            labelKey = null,
            literalLabel = label,
            icon = OutboxUiIcon.NONE,
            target = OutboxNavigationSource.Unknown,
            glyph = glyph,
        )

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
