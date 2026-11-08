package me.meeshy.sdk.outbox

import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.model.sync.OutboxUiItem

/**
 * Ce que la pastille de synchronisation lit de la file (miroir d'iOS `OfflineQueuePillProviding`) : un seul flux
 * d'éléments, sans dépendre de toute la surface du dépôt, et la relance d'une ligne définitivement échouée — déclarée ICI
 * parce que c'est la pastille qui la déclenche : elle est la seule surface où une ligne épuisée est visible.
 */
public interface OfflineQueuePillProviding {
    /** La tête de file (en attente, en vol, épuisée), plus ancienne d'abord, rejouée à chaque changement d'une ligne. */
    public val pendingUiItems: Flow<List<OutboxUiItem>>

    /** Relance une ligne épuisée ; `false` quand elle n'existe plus ou n'est pas relançable. */
    public suspend fun retryItem(outboxId: String): Boolean
}
