package me.meeshy.sdk.model.syncpill

import me.meeshy.sdk.model.sync.OutboxUiItem
import me.meeshy.sdk.model.sync.OutboxUiKind

/**
 * Les règles pures de `RootPendingBanners` (iOS) : le seul bandeau ambre du haut de l'écran compte les RÉGLAGES en
 * attente. Une story en attente se lit à l'horloge (anneau du plateau, « File » de Mes stories), jamais à un bandeau
 * en haut des racines (#15223) : la file des stories n'entre pas dans ce compte.
 */
object PendingBanners {
    private const val SETTINGS_KEY = "updateSettings"

    /** Une ligne épuisée n'est plus « en attente » : elle a renoncé, la pastille globale la porte. */
    fun pendingSettings(items: List<OutboxUiItem>): Int =
        items.count { !it.status.isTerminal && it.kind == OutboxUiKind.OTHER && it.otherKey == SETTINGS_KEY }
}
