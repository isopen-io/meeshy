package me.meeshy.sdk.notification

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationConsumptionCadence
import me.meeshy.sdk.model.NotificationReadScope
import me.meeshy.sdk.model.NotificationSelfReadLedger
import me.meeshy.sdk.model.NotificationTypeSelection
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.NotificationApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.rawApiCall
import me.meeshy.sdk.session.PerAccountCache
import timber.log.Timber

/**
 * **UNE consommation, pour tous les chemins d'ouverture** — port de `NotificationToastManager.consume(_:)` (iOS).
 *
 * L'ordre est celui que l'utilisateur perçoit : l'état « lu » est d'abord appliqué au cache et à toutes les vues
 * montées, le compteur est décrémenté, la portée est publiée ; le réseau vient ENSUITE, et un refus annule de façon
 * CIBLÉE (seules les lignes encore lues et auparavant non lues repassent non lues, le compteur est corrigé du delta
 * réellement annulé, une arrivée concurrente n'est jamais écrasée).
 *
 * Cadence : un POST `conversation/{id}/read` ou `post/{id}/read` au plus par clé et par fenêtre de cinq secondes, jamais
 * deux en vol, et aucun quand le cache connaît des notifications mais aucune non lue pour la portée.
 */
@Singleton
class NotificationConsumptionService @Inject constructor(
    private val repository: NotificationRepository,
    private val api: NotificationApi,
    private val events: NotificationConsumptionEvents,
    private val clock: CacheClock,
) : PerAccountCache {

    private val ledger = NotificationSelfReadLedger()
    private val cadence = NotificationConsumptionCadence()

    /** Consomme [scope]. `false` : refus du serveur (annulé) ou rien à consommer. */
    suspend fun consume(scope: NotificationReadScope): Boolean {
        if (scope.isEmpty) return false
        return when (scope) {
            is NotificationReadScope.Single -> consumeSingle(scope)
            is NotificationReadScope.Conversation, is NotificationReadScope.Post -> consumeContext(scope)
            is NotificationReadScope.Types -> consumeTypes(scope)
            NotificationReadScope.All -> consumeAll()
        }
    }

    private suspend fun consumeSingle(scope: NotificationReadScope.Single): Boolean {
        val now = clock.nowMillis()
        if (ledger.claimsEcho(scope.ledgerKey, now)) return false
        val known = repository.cachedItems(NotificationScope.All)?.firstOrNull { it.id == scope.id }
        if (known?.state?.isRead == true) return false
        ledger.register(scope.ledgerKey, now)
        repository.patchEverywhere { flipping(it, setOf(scope.id), read = true) }
        events.publishRead(scope)
        repository.adjustUnreadCount(-1)
        val result = apiCall { api.markAsRead(scope.id) }
        if (result is NetworkResult.Failure) {
            Timber.w("Marquage lu refusé pour une notification (%s)", result.error.code)
            ledger.forget(scope.ledgerKey)
            repository.patchEverywhere { flipping(it, setOf(scope.id), read = false) }
            repository.adjustUnreadCount(+1)
            events.publishRolledBack(scope)
            return false
        }
        return true
    }

    private suspend fun consumeContext(scope: NotificationReadScope): Boolean {
        val cached = repository.cachedItems(NotificationScope.All)
        val hasKnownUnread = cached.isNullOrEmpty() || NotificationReadScope.unreadMatching(scope, cached).isNotEmpty()
        val flipped = applyOptimistically(scope)
        if (!hasKnownUnread) return true
        val key = scope.ledgerKey
        if (!cadence.tryBegin(key, clock.nowMillis())) return true
        val result = rawApiCall {
            when (scope) {
                is NotificationReadScope.Conversation -> api.markConversationAsRead(scope.id).count ?: 0
                is NotificationReadScope.Post -> api.markPostAsRead(scope.id).count ?: 0
                else -> 0
            }
        }
        val ok = result is NetworkResult.Success
        cadence.finish(key, clock.nowMillis(), stamp = ok)
        if (!ok) rollBack(scope, flipped)
        return ok
    }

    private suspend fun consumeTypes(scope: NotificationReadScope.Types): Boolean {
        val batches = NotificationTypeSelection.readBatches(scope.types)
        if (batches.isEmpty()) return false
        val flipped = applyOptimistically(scope)
        batches.forEachIndexed { index, batch ->
            val result = rawApiCall { api.markTypesAsRead(batch).count ?: 0 }
            if (result is NetworkResult.Failure) {
                val unconfirmed = batches.drop(index).flatMap { it.types }.toSet()
                val notConfirmed = repository.cachedItems(NotificationScope.All).orEmpty()
                    .filter { it.id in flipped && it.type in unconfirmed }
                    .mapTo(HashSet()) { it.id }
                ledger.forget(scope.ledgerKey)
                rollBack(NotificationReadScope.Types(unconfirmed.toList()), notConfirmed)
                return false
            }
        }
        return true
    }

    private suspend fun consumeAll(): Boolean {
        val flipped = applyOptimistically(NotificationReadScope.All)
        val result = rawApiCall { api.markAllAsRead().count ?: 0 }
        if (result is NetworkResult.Failure) {
            rollBack(NotificationReadScope.All, flipped)
            return false
        }
        return true
    }

    /** Cache + vues + compteur + publication, avant tout réseau. Rend les identifiants que CE geste a fait basculer. */
    private fun applyOptimistically(scope: NotificationReadScope): Set<String> {
        val flipped = NotificationReadScope.unreadMatching(scope, repository.cachedItems(NotificationScope.All).orEmpty())
            .mapTo(HashSet()) { it.id }
        ledger.register(scope.ledgerKey, clock.nowMillis())
        if (flipped.isNotEmpty()) {
            repository.patchEverywhere { flipping(it, flipped, read = true) }
            repository.adjustUnreadCount(-flipped.size)
        }
        if (scope == NotificationReadScope.All) repository.setUnreadCount(0)
        events.publishRead(scope)
        return flipped
    }

    /** Le geste inverse, borné aux seules lignes de [flipped] encore lues ; le compteur reçoit le delta réellement annulé. */
    private fun rollBack(scope: NotificationReadScope, flipped: Set<String>) {
        ledger.forget(scope.ledgerKey)
        val reverted = repository.cachedItems(NotificationScope.All).orEmpty()
            .filter { it.id in flipped && it.state.isRead }
            .mapTo(HashSet()) { it.id }
        if (reverted.isNotEmpty()) {
            repository.patchEverywhere { flipping(it, reverted, read = false) }
            repository.adjustUnreadCount(+reverted.size)
        }
        events.publishRolledBack(scope)
    }

    // --- Échos socket -------------------------------------------------------------------------------------

    /** `notification:read` : l'écho de CET appareil ne décrémente pas une seconde fois, celui d'un autre s'applique. */
    fun onSocketRead(notificationId: String) {
        val own = ledger.claimsEcho(notificationId, clock.nowMillis())
        if (!own) repository.applyRead(notificationId)
        repository.patchEverywhere { flipping(it, setOf(notificationId), read = true) }
        events.publishRead(NotificationReadScope.Single(notificationId))
    }

    /** `notification:read-bulk` : une portée non traduisible est ignorée (et journalisée), jamais approximée. */
    fun onSocketReadBulk(scope: NotificationReadBulkScope) {
        val read = scope.toReadScope()
        if (read == null) {
            if (scope.contextKey != FRIEND_REQUEST_KEY) Timber.w("notification:read-bulk ignoré — portée non traduisible (%s)", scope.kind)
            repository.applyReadBulk(scope)
            return
        }
        if (ledger.claimsEcho(read.ledgerKey, clock.nowMillis())) return
        repository.applyReadBulk(scope)
        repository.patchEverywhere { rows -> rows.map { if (read.matches(it) && !it.state.isRead) it.markedRead(true) else it } }
        events.publishRead(read)
    }

    fun onSocketDeleted(notificationId: String) {
        repository.applyDeleted(notificationId)
        events.publishDeleted(notificationId)
    }

    /** `notification:deleted-bulk` : seule la purge des lignes lues est connue, toute autre forme est ignorée. */
    fun onSocketDeletedBulk(scope: NotificationDeletedBulkScope) {
        if (!scope.purgesReadRows()) {
            Timber.w("notification:deleted-bulk ignoré — portée inconnue (%s)", scope.kind)
            return
        }
        repository.applyDeletedBulk(scope)
        repository.patchEverywhere { rows -> rows.filterNot { it.state.isRead } }
    }

    /** Une notification née lue sur ce contenu : l'écho `notification:read` qui suit est le NÔTRE, il ne décrémente pas. */
    fun declareSelfRead(notificationId: String) {
        ledger.register(NotificationReadScope.Single(notificationId).ledgerKey, clock.nowMillis())
    }

    /** Le serveur a refusé : aucun écho ne viendra, celui d'un autre appareil doit de nouveau s'appliquer. */
    fun retractSelfRead(notificationId: String) {
        ledger.forget(NotificationReadScope.Single(notificationId).ledgerKey)
    }

    override suspend fun clear() {
        ledger.clear()
        cadence.clear()
    }

    private companion object {
        const val FRIEND_REQUEST_KEY = "friendRequestId"

        fun flipping(rows: List<ApiNotification>, ids: Set<String>, read: Boolean): List<ApiNotification> {
            if (rows.none { it.id in ids && it.state.isRead != read }) return rows
            return rows.map { if (it.id in ids && it.state.isRead != read) it.markedRead(read) else it }
        }

        fun ApiNotification.markedRead(read: Boolean): ApiNotification = copy(state = state.copy(isRead = read))
    }
}
