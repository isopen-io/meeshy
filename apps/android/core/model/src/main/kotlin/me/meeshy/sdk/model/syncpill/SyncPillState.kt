package me.meeshy.sdk.model.syncpill

import me.meeshy.sdk.model.sync.OutboxUiItem
import me.meeshy.sdk.model.sync.OutboxUiProjection
import me.meeshy.sdk.model.sync.OutboxUiStatus

/** L'état que la pastille montre pour la file (miroir d'iOS `PillState`). Priorité : échec > hors ligne > en cours > rien. */
sealed interface SyncPillState {
    val items: List<OutboxUiItem> get() = emptyList()

    data object Hidden : SyncPillState
    data class Syncing(override val items: List<OutboxUiItem>) : SyncPillState
    data class Offline(override val items: List<OutboxUiItem>) : SyncPillState
    data class Failed(override val items: List<OutboxUiItem>) : SyncPillState

    companion object {
        /** Une ligne en vol depuis plus que cela compte comme hors ligne même réseau OK : la socket a calé en silence. */
        const val STALE_INFLIGHT_MS: Long = 4_000L

        /**
         * Pure et sans horloge cachée : la péremption est par ENTRÉE, jamais par pastille — une ligne morte périmée sort
         * sans emporter le travail encore vivant, ni faire virer la pastille au rouge pendant qu'un envoi est en cours.
         */
        fun derive(items: List<OutboxUiItem>, isOffline: Boolean, now: Long): SyncPillState {
            val live = items.filter { OutboxUiProjection.isDisplayable(it, now) }
            val hasStaleInflight = live.any {
                it.status == OutboxUiStatus.INFLIGHT && now - it.createdAt > STALE_INFLIGHT_MS
            }
            return when {
                live.any { it.status.isTerminal } -> Failed(live)
                isOffline || hasStaleInflight -> Offline(live)
                live.isNotEmpty() -> Syncing(live)
                else -> Hidden
            }
        }

        /**
         * L'instant de la plus proche péremption d'une entrée terminale, ou `null` : le réveil s'arme dessus, jamais un
         * minuteur permanent (une file qui ne contient QUE des terminales n'émet plus, et la fenêtre serait inerte).
         */
        fun nextExpiry(items: List<OutboxUiItem>, now: Long): Long? = items
            .filter { it.status.isTerminal }
            .map { it.updatedAt + OutboxUiProjection.TERMINAL_DISPLAY_WINDOW_MS }
            .filter { it > now }
            .minOrNull()
    }
}
