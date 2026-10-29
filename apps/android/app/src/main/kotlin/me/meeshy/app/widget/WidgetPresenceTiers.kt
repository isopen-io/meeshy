package me.meeshy.app.widget

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.onStart
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.presence.PresenceDecayClock
import me.meeshy.sdk.model.presence.PresenceMap
import me.meeshy.sdk.socket.PresenceStore
import me.meeshy.sdk.theme.otherParticipantUserId

/**
 * Ce que les widgets savent de la présence (#13747) : l'état SERVI par la carte vivante de l'app
 * (`PresenceStore`, qui exclut déjà le compte courant), recalculé à l'instant du rendu par la règle
 * 1/3/5. Un pair que la carte ne connaît pas n'a aucune entrée : rien n'est fabriqué, donc aucun
 * point. Ces états ne sont jamais écrits quelque part : ils se dérivent à chaque rendu, si bien
 * qu'un changement de compte (la carte est vidée) les efface sans autre geste.
 *
 * [changes] est le déclencheur de repeinte : il n'émet que lorsqu'un palier d'un pair AFFICHÉ
 * change — pas à chaque événement de présence, pas à chaque battement de l'horloge.
 */
internal object WidgetPresenceTiers {

    /** Les pairs des lignes que les deux widgets montrent : favoris et récentes directes. */
    fun displayedPeerIds(conversations: List<ApiConversation>, currentUserId: String?): Set<String> =
        (FavoriteContactsWidgetPresentation.selection(conversations) + RecentConversationsWidgetPresentation.selection(conversations))
            .filter { it.type.lowercase() in directConversationTypes }
            .mapNotNull { it.otherParticipantUserId(currentUserId) }
            .toSet()

    /** Le palier de chaque pair de [peerIds] que [entries] a servi, à [nowMillis]. */
    fun tiers(entries: PresenceMap, peerIds: Set<String>, nowMillis: Long): Map<String, PresenceState> =
        peerIds.mapNotNull { id ->
            PresenceDecayClock.derive(entries[id], nowMillis)?.let { id to it }
        }.toMap()

    /** Les paliers à peindre MAINTENANT, depuis la carte vivante de l'app. */
    fun forDisplay(store: PresenceStore, conversations: List<ApiConversation>, currentUserId: String?): Map<String, PresenceState> =
        tiers(store.entries.value, displayedPeerIds(conversations, currentUserId), store.nowMillis())

    @OptIn(ExperimentalCoroutinesApi::class)
    fun changes(
        peerIds: Flow<Set<String>>,
        entries: Flow<PresenceMap>,
        decayTicks: Flow<Unit>,
        nowMillis: () -> Long,
    ): Flow<Map<String, PresenceState>> =
        peerIds.distinctUntilChanged().flatMapLatest { ids ->
            if (ids.isEmpty()) flowOf(emptyMap())
            else combine(entries, decayTicks.onStart { emit(Unit) }) { map, _ -> tiers(map, ids, nowMillis()) }
        }.distinctUntilChanged()
}
