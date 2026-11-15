package me.meeshy.sdk.model.sync

/** Le genre d'une opération en file, tel que la pastille la formule (miroir d'iOS `OutboxUIItem.Kind`). */
enum class OutboxUiKind { MESSAGE, REACTION, EDIT, DELETE, STORY, POST_COMMENT, POST_REACTION, OTHER }

/** L'icône d'une opération (miroir d'iOS `OutboxUIItem.IconKind`). */
enum class OutboxUiIcon { TEXT, AUDIO, IMAGE, VIDEO, FILE, REACTION, STICKER, NONE }

/** L'état d'une ligne vu de l'UI. Android n'a pas de `FAILED` transitoire (un échec définitif est `EXHAUSTED`). */
enum class OutboxUiStatus {
    PENDING,
    INFLIGHT,
    FAILED,
    EXHAUSTED,
    ;

    /** Une ligne que plus rien ne fait avancer seule : le flusher ne reprend que les `PENDING`. */
    val isTerminal: Boolean get() = this == FAILED || this == EXHAUSTED
}

/**
 * L'instantané d'une ligne de l'outbox pour la pastille, sans fuite de la charge de la ligne dans la couche vue.
 *
 * [otherKey] qualifie un [OutboxUiKind.OTHER] (la clé iOS du genre : `markAsRead`, `blockUser`…).
 * [updatedAt] est l'horloge de la LIGNE : pour une ligne terminale, l'instant où elle a renoncé. La fenêtre
 * d'affichage d'un échec se mesure dessus, jamais sur [createdAt] (un vieil envoi qui échoue maintenant ne naît pas périmé).
 */
data class OutboxUiItem(
    val id: String,
    val kind: OutboxUiKind,
    val titlePreview: String?,
    val iconKind: OutboxUiIcon,
    val attachmentCount: Int,
    val source: OutboxNavigationSource,
    val status: OutboxUiStatus,
    val createdAt: Long,
    val updatedAt: Long = createdAt,
    val otherKey: String? = null,
)
