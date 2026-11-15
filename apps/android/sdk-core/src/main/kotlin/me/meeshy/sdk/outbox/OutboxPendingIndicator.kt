package me.meeshy.sdk.outbox

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.model.sync.OutboxUiItem
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Ce que l'UI lit de l'outbox (miroir d'iOS `OutboxPendingIndicator`) : le nombre d'opérations en attente, l'alerte de
 * quasi-saturation et la tête de file pour la pastille.
 *
 * Le compteur et la pastille excluent la MÊME liste de genres ([OutboxKindCatalog.syncIndicatorExcludedDiskValues]) : un
 * accusé de lecture coincé ne maintient pas la bannière quand la conversation est synchronisée, et ne tourne pas en carrousel
 * pour une conversation simplement ouverte.
 */
@Singleton
public class OutboxPendingIndicator @Inject constructor(
    private val outbox: OutboxRepository,
) : OfflineQueuePillProviding {

    /** Les lignes que l'indicateur « Synchronisation… » compte (en attente ou en vol, hors genres d'arrière-plan). */
    public val pendingCount: Flow<Int> = outbox.observeSyncIndicatorCount().distinctUntilChanged()

    /** Vrai dès 80 % du plafond de la file (400 sur 500) : l'UI prévient avant qu'un enfilage soit refusé. */
    public val isNearCapacity: Flow<Boolean> =
        pendingCount.map { it >= OutboxCapacity.ALERT_ROWS }.distinctUntilChanged()

    override val pendingUiItems: Flow<List<OutboxUiItem>> = outbox.observeUiItems()

    override suspend fun retryItem(outboxId: String): Boolean = outbox.retryWithPrerequisites(outboxId)
}
