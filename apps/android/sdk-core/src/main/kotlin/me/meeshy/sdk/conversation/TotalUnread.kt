package me.meeshy.sdk.conversation

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.sdk.model.sync.UnreadRules
import me.meeshy.sdk.sync.UnreadLedger

/**
 * UNE formule de total pour le badge d'application, l'onglet, le widget et la notification : la somme des
 * non-lus des AUTRES conversations que celles qui sont ouvertes, clamp à zéro. Deux lectures de la même formule :
 * le registre vivant (réactif, sans disque) et le SUM SQL (hors processus, widgets).
 */
public object TotalUnread {

    /** Depuis le registre vivant. */
    public fun live(ledger: UnreadLedger): Flow<Int> =
        ledger.snapshot.map { it.totalOthers }.distinctUntilChanged()

    /** Depuis le cache : un SUM SQL, aucun décodage de charge. */
    public fun fromCache(dao: ConversationDao, openIds: Set<String>): Flow<Int> =
        dao.totalUnreadExcludingOpen(openIds.toList()).map { it.coerceAtLeast(0) }

    /** La formule pure, pour une liste déjà en main. */
    public fun of(counts: Map<String, Int>, openIds: Set<String>): Int =
        UnreadRules.totalConversationsUnread(counts, openIds)
}
