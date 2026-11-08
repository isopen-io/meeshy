package me.meeshy.sdk.model.connection

import me.meeshy.sdk.model.sync.OutboxUiItem

/** Ce que la pastille de connexion montre à un instant donné. */
enum class ConnectionPill { HIDDEN, SYNCING, CONNECTING, RECONNECTING, OFFLINE, BACK_ONLINE }

/**
 * L'état de la pastille de connexion : le dernier [status], depuis quand ([since]), si un état dégradé a RÉELLEMENT été
 * montré ([degradedShown]) et jusqu'à quand la confirmation verte tient ([backOnlineUntil]).
 */
data class ConnectionPillState(
    val status: ConnectionStatus,
    val since: Long,
    val degradedShown: Boolean = false,
    val backOnlineUntil: Long? = null,
)

/** L'affichage des entrées : leur signature, et le dernier instant où une NOUVELLE entrée est arrivée. */
data class SyncPillDisplayState(val entryIds: Set<String> = emptySet(), val changedAt: Long = 0L)

/**
 * Le réducteur pur de la pastille globale (miroir d'iOS `ConnectionStatusViewModel` + `SyncPillViewModel` + rotation),
 * sans horloge cachée : chaque fonction reçoit `now`, le test tourne en temps virtuel et l'écran n'arme un réveil que
 * sur [nextDeadline] — jamais un minuteur permanent.
 */
object SyncPillReducer {
    /** Rien n'est montré pendant ce délai : une reconnexion rapide, et la première connexion d'un lancement, restent invisibles. */
    const val GRACE_MS: Long = 3_000L

    /** La confirmation verte « En ligne », seulement si un état dégradé a réellement été montré. */
    const val BACK_ONLINE_MS: Long = 4_000L

    /** Sans nouvelle entrée, l'affichage s'efface après cela (sauf état persistant). */
    const val CLEAR_AFTER_MS: Long = 6_000L

    fun initial(status: ConnectionStatus, now: Long): ConnectionPillState = ConnectionPillState(status, since = now)

    fun pill(state: ConnectionPillState, now: Long): ConnectionPill = when (state.status) {
        ConnectionStatus.OFFLINE -> ConnectionPill.OFFLINE
        ConnectionStatus.CONNECTING, ConnectionStatus.DISCONNECTED -> when {
            now - state.since < GRACE_MS -> ConnectionPill.HIDDEN
            state.status == ConnectionStatus.CONNECTING -> ConnectionPill.CONNECTING
            else -> ConnectionPill.RECONNECTING
        }
        ConnectionStatus.SYNCING, ConnectionStatus.CONNECTED -> when {
            state.backOnlineUntil?.let { now < it } == true -> ConnectionPill.BACK_ONLINE
            state.status == ConnectionStatus.SYNCING -> ConnectionPill.SYNCING
            else -> ConnectionPill.HIDDEN
        }
    }

    /** Retient qu'un état dégradé a été VU (appelé au réveil de la grâce) et solde la confirmation échue. */
    fun settle(state: ConnectionPillState, now: Long): ConnectionPillState {
        val shown = when (pill(state, now)) {
            ConnectionPill.OFFLINE, ConnectionPill.CONNECTING, ConnectionPill.RECONNECTING -> true
            else -> false
        }
        val expired = state.backOnlineUntil?.let { now >= it } == true
        return state.copy(
            degradedShown = state.degradedShown || shown,
            backOnlineUntil = if (expired) null else state.backOnlineUntil,
        )
    }

    fun onStatus(state: ConnectionPillState, next: ConnectionStatus, now: Long): ConnectionPillState {
        val settled = settle(state, now)
        if (next == settled.status) return settled
        val wasVisiblyDegraded = settled.status.isDegraded && settled.degradedShown
        return when {
            next.isDegraded -> settled.copy(
                status = next,
                since = if (wasVisiblyDegraded) settled.since else now,
                backOnlineUntil = null,
            )
            settled.status.isDegraded -> settled.copy(
                status = next,
                since = now,
                degradedShown = false,
                backOnlineUntil = if (settled.degradedShown) now + BACK_ONLINE_MS else null,
            )
            else -> settled.copy(status = next, since = now)
        }
    }

    /** L'instant du prochain changement d'affichage dû au seul temps, ou `null` : alors rien à armer. */
    fun nextDeadline(state: ConnectionPillState, now: Long): Long? {
        val grace = state.since + GRACE_MS
        val graceDeadline = grace.takeIf { state.status in setOf(ConnectionStatus.CONNECTING, ConnectionStatus.DISCONNECTED) && it > now }
        val confirm = state.backOnlineUntil?.takeIf { it > now }
        return listOfNotNull(graceDeadline, confirm).minOrNull()
    }

    /** Les entrées du carrousel : opérations de la file, puis une entrée de frappe par conversation non ouverte (ordre stable par id). */
    fun entries(
        items: List<OutboxUiItem>,
        typers: List<SyncPillTyper>,
        openConversationId: String?,
    ): List<SyncPillEntry> {
        val typing = typers
            .filter { it.conversationId != openConversationId }
            .distinctBy { it.conversationId }
            .sortedBy { it.conversationId }
            .map { SyncPillEntry.forTyping(it.conversationId, it.username) }
        return items.map(SyncPillEntry::forOperation) + typing
    }

    /** Une nouvelle entrée relance les 6 s ; une liste vide remet à zéro. */
    fun display(previous: SyncPillDisplayState, entries: List<SyncPillEntry>, now: Long): SyncPillDisplayState {
        val ids = entries.map { it.id }.toSet()
        if (ids.isEmpty()) return SyncPillDisplayState()
        val hasNew = ids.any { it !in previous.entryIds }
        return SyncPillDisplayState(ids, if (hasNew) now else previous.changedAt)
    }

    /** Visible tant qu'il y a des entrées et que (état persistant — une erreur, le hors ligne — ou moins de 6 s sans nouveauté). */
    fun isVisible(display: SyncPillDisplayState, persistent: Boolean, now: Long): Boolean =
        display.entryIds.isNotEmpty() && (persistent || now - display.changedAt < CLEAR_AFTER_MS)

    fun clearDeadline(display: SyncPillDisplayState, persistent: Boolean, now: Long): Long? =
        (display.changedAt + CLEAR_AFTER_MS).takeIf { !persistent && display.entryIds.isNotEmpty() && it > now }
}
