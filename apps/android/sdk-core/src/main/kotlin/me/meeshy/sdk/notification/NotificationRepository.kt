package me.meeshy.sdk.notification

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.transformLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.MarkReadResponse
import me.meeshy.sdk.model.NotificationCachePatch
import me.meeshy.sdk.model.NotificationCounts
import me.meeshy.sdk.model.NotificationFlightChanges
import me.meeshy.sdk.model.NotificationFlightLanding
import me.meeshy.sdk.model.NotificationTypeSelection
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.RegisterDeviceTokenRequest
import me.meeshy.sdk.model.RegisterDeviceTokenResponse
import me.meeshy.sdk.model.UnregisterDeviceTokenRequest
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.NotificationApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.pagedApiCall
import me.meeshy.sdk.net.rawApiCall
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/** User notifications — port of NotificationService (NotificationService.swift). */
@Singleton
class NotificationRepository @Inject constructor(
    private val notificationApi: NotificationApi,
    private val clock: CacheClock = SystemCacheClock,
    private val store: NotificationCacheStore = NoNotificationCacheStore,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    // L1 en mémoire ; la portée « all » est relue du disque au premier cadre ([hydrateOnce]) et réécrite à chaque
    // changement ([startPersisting]), de sorte qu'un démarrage à froid ou hors ligne affiche la liste sans réseau.
    private val _notificationsCache = MutableStateFlow<List<ApiNotification>?>(null)
    private val _notificationsSyncedAt = MutableStateFlow<Long?>(null)
    private val _unreadCount = MutableStateFlow(0)
    private val _hasMore = MutableStateFlow(false)

    /** Les consommations par conversation / post en vol : un second appel identique se confond avec le premier. */
    private val consumptionsInFlight: MutableSet<String> = ConcurrentHashMap.newKeySet()
    
    /**
     * L'ANCRE que le serveur a servie avec la dernière page (#4901) — empruntée
     * verbatim par [loadMore], jamais composée ici. `null` = gateway antérieur
     * (aucun curseur servi) : le repli par RANG reste formulable, avec son
     * défaut connu et VISIBLE (une insertion en tête fait resservir une ligne —
     * le doublon est le signal, il ne se masque plus).
     */
    private val _nextCursor = MutableStateFlow<String?>(null)

    /** Les portées autres que « all » : en mémoire, pour la session, vidées à la déconnexion. */
    private val scopedLists = ConcurrentHashMap<NotificationScope, List<ApiNotification>>()

    private val hydration = Mutex()
    @Volatile private var hydrated = false

    /** Change à chaque [clear] : une écriture différée ou une relecture d'un compte qui part ne se pose jamais sur le suivant. */
    @Volatile private var epoch = 0L
    private val persistScope = CoroutineScope(SupervisorJob() + ioDispatcher)
    private var lastPersisted: PersistedNotifications? = null

    /** Le vidage disque de [clear] : toute relecture ou écriture du compte suivant l'attend, jamais l'inverse. */
    @Volatile private var pendingDiskClear: Job? = null

    /**
     * #18915 (AND-05) — les relectures en vol, chacune avec son journal ([NotificationFlightChanges]) ouvert au départ
     * de sa requête : chaque arrivée en direct et chaque lecture posée sur la liste « all » pendant qu'elle attend s'y
     * inscrit, et la page construite avant elles atterrit par-dessus ([NotificationFlightLanding]). Tout passe sous
     * [flightLock] : une arrivée ne se glisse jamais entre la lecture du journal et l'écriture de la page.
     *
     * Une relecture appartient au compte sous lequel elle est partie ([Flight.epoch]) : [clear] ferme tous les vols, et
     * ce qu'une relecture du compte parti rapporte (page, compteur) n'atterrit jamais chez le suivant.
     *
     * Et TOUTE écriture de la liste « all » passe sous ce même verrou, composée depuis la liste VIVANTE : un écrivain qui
     * lisait hors de la section des autres effaçait, en écrivant, ce qu'un autre avait posé entre sa lecture et son
     * écriture (une suppression reçue du socket pendant qu'une lecture se posait, une arrivée pendant la page suivante).
     */
    private val flightLock = Any()
    private var flights: Map<Long, NotificationFlightChanges> = emptyMap()
    private var flightCount = 0L

    /** Une relecture en vol : la clé de son journal dans [flights], et la génération de compte ([epoch]) où elle est partie. */
    private class Flight(val id: Long, val epoch: Long)

    init {
        if (store !== NoNotificationCacheStore) startPersisting()
    }

    /** The server's unread count, kept fresh alongside every [notificationsStream] revalidate. */
    val unreadCountStream: StateFlow<Int> = _unreadCount.asStateFlow()

    /** Whether the server reports another page beyond the currently cached notifications. */
    val hasMoreStream: StateFlow<Boolean> = _hasMore.asStateFlow()

    /**
     * Cache-first notification stream (ARCHITECTURE.md §4, feature-parity §M). An in-memory L1
     * cache serves stale data immediately; background revalidation is triggered on staleness —
     * same shape as [me.meeshy.sdk.post.PostRepository.feedStream].
     */
    fun notificationsStream(
        policy: CachePolicy = CachePolicy.Notifications,
        onSyncError: (Throwable) -> Unit = {},
    ): Flow<CacheResult<List<ApiNotification>>> = flow {
        hydrateOnce()
        emitAll(liveStream(policy, onSyncError))
    }

    private fun liveStream(
        policy: CachePolicy,
        onSyncError: (Throwable) -> Unit,
    ): Flow<CacheResult<List<ApiNotification>>> =
        combine(_notificationsCache, _notificationsSyncedAt) { data, syncedAt -> data to syncedAt }
            .distinctUntilChanged()
            .transformLatest { (data, syncedAt) ->
                if (data == null) {
                    emit(CacheResult.Empty)
                    revalidateNotifications(onSyncError)
                    return@transformLatest
                }
                val age = syncedAt?.let { clock.nowMillis() - it } ?: Long.MAX_VALUE
                when {
                    age <= policy.freshForMillis -> emit(CacheResult.Fresh(data, age))
                    age <= policy.keepForMillis -> {
                        emit(CacheResult.Stale(data, age))
                        revalidateNotifications(onSyncError)
                    }
                    else -> {
                        emit(CacheResult.Syncing(data))
                        revalidateNotifications(onSyncError)
                    }
                }
            }

    /** Forces a revalidation regardless of freshness — the pull-to-refresh entry point. */
    suspend fun refresh() = revalidateNotifications()

    /**
     * La relecture silencieuse des 30 dernières notifications (resynchro après un trou, une reconnexion ou un retour au
     * premier plan). Le compteur est lu INDÉPENDAMMENT de la liste et posé même quand la liste échoue ; un échec
     * laisse le cache intact et se rend à l'appelant, qui le journalise. `null` = tout a abouti.
     */
    suspend fun resync(): Throwable? {
        var failure: Throwable? = null
        revalidateNotifications { failure = it }
        return failure
    }

    /**
     * A real-time `notification:new` arrival (feature-parity §M) prepends into the SAME cache
     * [notificationsStream] serves — a live notification is never silently overwritten by the
     * next observer's re-read or a concurrent revalidate: a re-read in flight journals it, and its
     * page lands over it (#18915). Dedupes by id (a REST-list race or a duplicate delivery is a
     * no-op) and bumps [unreadCountStream] only when unread.
     */
    fun prependLive(notification: ApiNotification) {
        synchronized(flightLock) {
            val current = _notificationsCache.value
            if (current != null && current.any { it.id == notification.id }) return
            // Aucune liste chargée : fabriquer un cache d'une ligne ferait croire qu'il est complet et masquerait la
            // vraie liste. Le compteur, lui, est exact — la page d'une relecture en vol, ou la suivante, apporte la ligne.
            if (current != null) _notificationsCache.value = NotificationCachePatch.insertingAtHead(current, notification)
            if (!notification.state.isRead) _unreadCount.update { it + 1 }
            flights = flights.mapValues { (_, changes) -> changes.arrived(notification) }
        }
    }

    /**
     * Primitive idempotente pour les lots qui suivent : applique [transform] à la liste de [scope]. Sur « all », rien
     * ne se passe tant que la liste n'est pas chargée ; sur une autre portée, la liste en mémoire de la session.
     */
    fun patch(scope: NotificationScope = NotificationScope.All, transform: (List<ApiNotification>) -> List<ApiNotification>) {
        if (scope.isAll) {
            rewriteAll(transform)
        } else {
            scopedLists.computeIfPresent(scope) { _, current -> transform(current) }
        }
    }

    /** Remplace la liste de [scope] ; sur « all », le curseur et `hasMore` accompagnent la liste et sont persistés avec elle. */
    fun replaceAll(
        scope: NotificationScope = NotificationScope.All,
        items: List<ApiNotification>,
        hasMore: Boolean = false,
        nextCursor: String? = null,
    ) {
        if (!scope.isAll) {
            scopedLists[scope] = items
            return
        }
        synchronized(flightLock) {
            _hasMore.value = hasMore
            _nextCursor.value = nextCursor
            _notificationsCache.value = items
            _notificationsSyncedAt.value = clock.nowMillis()
        }
    }

    /**
     * Applique [transform] à la liste « all » ET à chaque liste de portée chargée dans la session : un marquage « lu » se
     * lit dans TOUTES les vues montées (cloche, onglets, non lues seulement), pas seulement dans la liste complète.
     */
    fun patchEverywhere(transform: (List<ApiNotification>) -> List<ApiNotification>) {
        rewriteAll(transform)
        scopedLists.replaceAll { _, current -> transform(current) }
    }

    /** Corrige le compteur de non-lues d'un [delta] relatif (jamais en dessous de zéro) : atomique, contrairement à lire puis écrire. */
    fun adjustUnreadCount(delta: Int) {
        _unreadCount.update { (it + delta).coerceAtLeast(0) }
    }

    /** La liste en mémoire d'une portée autre que « all » ; `null` tant qu'elle n'a pas été chargée dans cette session. */
    fun cachedItems(scope: NotificationScope): List<ApiNotification>? =
        if (scope.isAll) _notificationsCache.value else scopedLists[scope]

    fun setUnreadCount(count: Int) {
        _unreadCount.value = count.coerceAtLeast(0)
    }

    /**
     * A `notification:read` arriving on the socket — from ANOTHER device, or the echo of this
     * device's OWN [markAsRead] (the gateway broadcasts to every socket in `ROOMS.user`,
     * originator included) — applies the read state to the shared cache. A row already read
     * (this device's own optimistic mutation already landed, or a duplicate delivery) is a
     * no-op, so the echo case never double-decrements [unreadCountStream].
     */
    fun applyRead(notificationId: String) {
        synchronized(flightLock) {
            val current = _notificationsCache.value ?: return
            val wasUnread = current.firstOrNull { it.id == notificationId }?.state?.isRead == false
            if (!wasUnread) return
            rewriteAll { list -> NotificationCachePatch.markingRead(list, notificationId) }
            _unreadCount.update { (it - 1).coerceAtLeast(0) }
        }
    }

    /**
     * `notification:read-bulk` — a bulk mark-as-read the gateway applied via `updateMany`/
     * `$runCommandRaw`, which returns no ids to enumerate; the event instead announces the
     * PREDICATE it applied, replayed here through the shared, single-source-of-truth
     * [notificationMatchesReadBulkScope] (a local reimplementation would risk marking a
     * different row set than the server did). [unreadCountStream] is deliberately left
     * untouched: this cache is a partial (paginated) view, so it matches fewer rows than the
     * server marked — decrementing from this predicate would make the badge drift.
     * `notification:counts`, emitted right after by the gateway, is what corrects it — mirrors
     * web's `handleNotificationReadBulk`.
     */
    fun applyReadBulk(scope: NotificationReadBulkScope) {
        synchronized(flightLock) {
            val current = _notificationsCache.value ?: return
            val touched = current.any { !it.state.isRead && notificationMatchesReadBulkScope(scope, it) }
            if (!touched) return
            rewriteAll { list ->
                list.map {
                    if (!it.state.isRead && notificationMatchesReadBulkScope(scope, it)) {
                        it.copy(state = it.state.copy(isRead = true))
                    } else {
                        it
                    }
                }
            }
        }
    }

    /**
     * A `notification:deleted` arriving on the socket — from another device, or the echo of
     * this device's own [delete] — removes the row from the shared cache. Mirrors [applyRead]'s
     * echo-safety: a row already absent (this device's own optimistic removal already landed)
     * is a no-op.
     */
    fun applyDeleted(notificationId: String) {
        synchronized(flightLock) {
            val current = _notificationsCache.value ?: return
            val existing = current.firstOrNull { it.id == notificationId } ?: return
            _notificationsCache.value = current.filterNot { it.id == notificationId }
            if (!existing.state.isRead) _unreadCount.update { (it - 1).coerceAtLeast(0) }
        }
    }

    /**
     * `notification:deleted-bulk` — symmetric of [applyReadBulk] on the PURGE side, replayed
     * through the shared [notificationMatchesDeletedBulkScope]. [unreadCountStream] is not a
     * precaution here but a CONSEQUENCE of the predicate: every row the gateway purges this way
     * was already read (`deleteMany({ isRead: true })`), so it was never counted in `unread`.
     */
    fun applyDeletedBulk(scope: NotificationDeletedBulkScope) {
        synchronized(flightLock) {
            val current = _notificationsCache.value ?: return
            val touched = current.any { notificationMatchesDeletedBulkScope(scope, it) }
            if (!touched) return
            _notificationsCache.value = current.filterNot { notificationMatchesDeletedBulkScope(scope, it) }
        }
    }

    /**
     * `notification:counts` — the gateway's server-authoritative resync, emitted after every
     * notification mutation (this device's or another's). Without it the badge only corrects
     * on the next full refetch; [applyReadBulk]/[applyDeletedBulk] both rely on it for exactly
     * that correction, since their own partial cache cannot recompute the true unread count.
     */
    fun applyCounts(unread: Int) {
        _unreadCount.value = unread
    }

    /**
     * [types] ne garde que ces types bruts, [hideReadTypes] retire les lignes DÉJÀ LUES de ces
     * types (le contenu consommé) — deux sélections que la passerelle applique en base, donc la
     * pagination ne sert jamais de pages de lignes invisibles. Vides : aucun filtre. Le curseur
     * gagne sur [offset] : quand il est donné, le rang part nul.
     */
    suspend fun list(
        offset: Int = 0,
        limit: Int = 20,
        unreadOnly: Boolean = false,
        cursor: String? = null,
        types: Collection<String> = emptyList(),
        hideReadTypes: Collection<String> = emptyList(),
    ): NetworkResult<List<ApiNotification>> =
        apiCall {
            notificationApi.list(
                offset = if (cursor === null) offset else null,
                limit = limit,
                unreadOnly = if (unreadOnly) true else null,
                cursor = cursor,
                types = NotificationTypeSelection.csv(types),
                hideReadTypes = NotificationTypeSelection.csv(hideReadTypes),
            )
        }

    /**
     * Une page de la liste de [scope] avec sa pagination PROPRE (curseur servi, sinon rang [offset]) : chaque catégorie
     * de la cloche pagine sa liste, indépendamment de la liste « all ». Rien n'est écrit ici — l'appelant range le
     * résultat par [replaceAll].
     */
    suspend fun listScopePage(
        scope: NotificationScope,
        cursor: String? = null,
        offset: Int = 0,
        limit: Int = PAGE_SIZE,
    ): NetworkResult<NotificationScopePage> =
        when (
            val result = pagedApiCall {
                notificationApi.list(
                    offset = if (cursor === null) offset else null,
                    limit = limit,
                    unreadOnly = if (scope.unreadOnly) true else null,
                    cursor = cursor,
                    types = NotificationTypeSelection.csv(scope.types.sorted()),
                    hideReadTypes = NotificationTypeSelection.csv(scope.hideReadTypes.sorted()),
                )
            }
        ) {
            is NetworkResult.Success -> NetworkResult.Success(
                NotificationScopePage(
                    items = result.data.data,
                    hasMore = result.data.pagination?.hasMore ?: (result.data.data.size >= limit),
                    nextCursor = result.data.pagination?.nextCursor,
                ),
            )
            is NetworkResult.Failure -> result
        }

    /** Les totaux de toute la boîte par type brut, tels que le serveur les compte (même prédicat que la liste). */
    suspend fun counts(): NetworkResult<NotificationCounts> = apiCall { notificationApi.counts() }

    /**
     * Fetches the page after the currently cached notifications, appending fresh rows
     * (deduped by id) and refreshing [hasMoreStream] from the server-authoritative
     * `pagination.hasMore` — port of iOS `NotificationListViewModel.loadMore`. A no-op before
     * the first page has loaded (nothing to paginate from yet) or once the server has already
     * said there is no further page; a failure leaves the cache and [hasMoreStream] untouched
     * so the next scroll simply retries.
     */
    suspend fun loadMore(): NetworkResult<Unit> {
        val current = _notificationsCache.value ?: return NetworkResult.Success(Unit)
        if (!_hasMore.value) return NetworkResult.Success(Unit)
        // Le CURSEUR gagne (#4901) : l'ancre servie est relayée verbatim, et la
        // tranche est insensible aux insertions en tête. Le RANG ne reste que
        // face à un gateway antérieur — et SANS dédoublonnage : l'union par
        // curseur est propre par construction, et au rang le doublon est le
        // SIGNAL (le `filterNot` d'avant supprimait la ligne perdue avec lui).
        val ancre = _nextCursor.value
        val opened = epoch
        return when (
            val result = pagedApiCall {
                notificationApi.list(if (ancre === null) current.size else null, PAGE_SIZE, null, ancre)
            }
        ) {
            is NetworkResult.Success -> {
                appendPage(opened, result.data.data, result.data.pagination)
                NetworkResult.Success(Unit)
            }
            is NetworkResult.Failure -> result
        }
    }

    /**
     * #18915 — the next page lands at the tail of the LIVE list, in [flightLock]'s section: never on the snapshot read
     * before its request, which would erase what arrived, was read or was deleted meanwhile. The next page of the
     * account that left ([clear] since its request, [opened] being the account generation it was asked under) continues
     * a list that is gone: it lands nothing.
     */
    private fun appendPage(opened: Long, items: List<ApiNotification>, pagination: Pagination?) {
        synchronized(flightLock) {
            val live = _notificationsCache.value ?: return
            if (opened != epoch) return
            _notificationsCache.value = live + items
            _hasMore.value = pagination?.hasMore ?: false
            _nextCursor.value = pagination?.nextCursor
        }
    }

    /** The gateway returns `{ success, count }` rather than the standard envelope. */
    suspend fun unreadCount(): NetworkResult<Int> =
        rawApiCall { notificationApi.unreadCount().count }

    /**
     * Optimistic: flips `isRead` in the shared cache before the network call, rolls back on
     * failure. The rollback is TARGETED — it remaps whichever list is current at that point,
     * flipping only [notificationId] back to unread — never a wholesale restore of the
     * pre-mutation snapshot, which would also clobber any [applyRead]/[applyDeleted]/
     * [prependLive] arrival that landed on the cache while this call was in flight.
     */
    suspend fun markAsRead(notificationId: String): NetworkResult<ApiNotification> {
        val previous = _notificationsCache.value
        val wasUnread = previous?.firstOrNull { it.id == notificationId }?.state?.isRead == false
        rewriteAll { list -> NotificationCachePatch.markingRead(list, notificationId) }
        if (wasUnread) _unreadCount.update { (it - 1).coerceAtLeast(0) }

        val result = apiCall { notificationApi.markAsRead(notificationId) }
        if (result is NetworkResult.Failure) {
            rewriteAll { list -> NotificationCachePatch.markingUnread(list, notificationId) }
            if (wasUnread) _unreadCount.update { it + 1 }
        }
        return result
    }

    /**
     * Optimistic: flips every `isRead` in the shared cache before the network call, rolls back
     * on failure. The rollback is TARGETED to the ids that were unread BEFORE this call (never
     * a wholesale restore of the pre-mutation snapshot — see [markAsRead]'s doc-comment), and
     * only reverts rows still `isRead` when the failure lands, so a concurrent [applyDeleted]
     * removal or a genuine [applyRead] confirmation for one of those ids is never undone.
     * [unreadCountStream] is corrected by the DELTA actually reverted, not a captured absolute
     * value that could itself be stale by the time the failure lands.
     */
    suspend fun markAllAsRead(): NetworkResult<Int> {
        val previous = _notificationsCache.value
        val previouslyUnreadIds = previous.orEmpty()
            .filter { !it.state.isRead }
            .mapTo(HashSet()) { it.id }
        rewriteAll { list -> NotificationCachePatch.markingAllRead(list) }
        _unreadCount.value = 0

        val result = rawApiCall { notificationApi.markAllAsRead().count ?: 0 }
        if (result is NetworkResult.Failure) {
            val revertedIds = _notificationsCache.value.orEmpty()
                .filter { it.id in previouslyUnreadIds && it.state.isRead }
                .mapTo(HashSet()) { it.id }
            rewriteAll { list ->
                list.map { if (it.id in revertedIds) it.copy(state = it.state.copy(isRead = false)) else it }
            }
            _unreadCount.update { it + revertedIds.size }
        }
        return result
    }

    /**
     * Optimistic: removes the row from the shared cache before the network call, rolls back
     * on failure. A deleted row that was unread also decrements [unreadCountStream] — mirrors
     * [markAsRead]'s exact optimistic-mutation shape. Port of iOS `NotificationRowView`'s
     * trailing swipe / `NotificationListViewModel.deleteNotification`. The rollback is
     * TARGETED — it reinserts only the removed row, at its ORIGINAL index, into whichever list is current at that
     * point (deduped by id, like [prependLive]), never a wholesale restore of the pre-mutation
     * snapshot.
     */
    suspend fun delete(notificationId: String): NetworkResult<Unit> {
        val (removedIndex, removed) = synchronized(flightLock) {
            val previous = _notificationsCache.value
            val index = previous?.indexOfFirst { it.id == notificationId } ?: -1
            _notificationsCache.value = previous?.filterNot { it.id == notificationId }
            index to previous?.getOrNull(index)
        }
        val wasUnread = removed?.state?.isRead == false
        if (wasUnread) _unreadCount.update { (it - 1).coerceAtLeast(0) }

        val result = apiCall { notificationApi.delete(notificationId) }
        if (result is NetworkResult.Failure) {
            if (removed != null) restoreAt(removedIndex, removed)
            if (wasUnread) _unreadCount.update { it + 1 }
        }
        return result
    }

    /** [delete]'s rollback: [row] back at [index] of the LIVE list, unless something already put it back. */
    private fun restoreAt(index: Int, row: ApiNotification) {
        synchronized(flightLock) {
            val list = _notificationsCache.value.orEmpty()
            if (list.none { it.id == row.id }) {
                _notificationsCache.value = list.toMutableList().apply { add(index.coerceIn(0, size), row) }
            }
        }
    }

    /**
     * Enregistre le jeton FCM de cet appareil : `platform = android`, `type = fcm`, jamais `apns`.
     * Le jeton seul suffit ; l'identité de l'appareil (nom, version, paquet) s'ajoute par la forme
     * qui prend une [RegisterDeviceTokenRequest].
     */
    suspend fun registerDeviceToken(token: String): NetworkResult<RegisterDeviceTokenResponse> =
        registerDeviceToken(RegisterDeviceTokenRequest.fcm(token))

    suspend fun registerDeviceToken(request: RegisterDeviceTokenRequest): NetworkResult<RegisterDeviceTokenResponse> =
        apiCall { notificationApi.registerDeviceToken(request) }

    /**
     * Désenregistre CE jeton. La passerelle supprime la ligne dont le jeton est exactement celui-là.
     * Un jeton vide ne part pas : un corps sans cible ferait supprimer TOUS les jetons du compte.
     */
    suspend fun unregisterDeviceToken(token: String): NetworkResult<Unit> =
        if (token.isBlank()) {
            blankArgument("token")
        } else {
            apiCall { notificationApi.unregisterDeviceToken(UnregisterDeviceTokenRequest.byToken(token)) }
                .map { }
        }

    /** Désenregistre tous les jetons d'UN appareil (`deviceId`), pas ceux des autres appareils du compte. */
    suspend fun unregisterDevice(deviceId: String): NetworkResult<Unit> =
        if (deviceId.isBlank()) {
            blankArgument("deviceId")
        } else {
            apiCall { notificationApi.unregisterDeviceToken(UnregisterDeviceTokenRequest.byDeviceId(deviceId)) }
                .map { }
        }

    private fun blankArgument(name: String): NetworkResult<Nothing> =
        NetworkResult.Failure(ApiError(message = "$name est requis", code = INVALID_ARGUMENT))

    /**
     * Le contenu d'une conversation est consommé (elle vient de s'ouvrir) : ses notifications
     * passent à lues. À lancer SANS attendre — l'écran ne dépend pas du résultat, et un échec ne
     * se montre pas : la prochaine révalidation ou `notification:counts` recale le compteur.
     *
     * Idempotent : l'appel serveur l'est, et deux appels simultanés pour la même conversation se
     * confondent en un seul. Un identifiant vide ne part pas (la route deviendrait
     * `notifications/conversation//read`, un 404 permanent).
     */
    suspend fun markConversationNotificationsAsRead(conversationId: String): NetworkResult<Int> =
        consumeOnce(
            key = "conversation:$conversationId",
            blank = conversationId.isBlank(),
            scope = NotificationReadBulkScope(
                kind = "context",
                contextKey = "conversationId",
                contextValue = conversationId,
            ),
        ) { notificationApi.markConversationAsRead(conversationId) }

    /** Idem pour un post, une story ou un statut qu'on vient d'ouvrir (borné par `context.postId`). */
    suspend fun markPostNotificationsAsRead(postId: String): NetworkResult<Int> =
        consumeOnce(
            key = "post:$postId",
            blank = postId.isBlank(),
            scope = NotificationReadBulkScope(kind = "context", contextKey = "postId", contextValue = postId),
        ) { notificationApi.markPostAsRead(postId) }

    /**
     * Un écran consomme une catégorie entière (les demandes d'ami, par exemple) : toutes les
     * notifications de ces [types] passent à lues. Une sélection plus longue que la borne de la
     * passerelle (30) part en tranches ; chaque tranche a son propre aller-retour optimiste, et la
     * première qui échoue arrête la suite — celles déjà appliquées restent appliquées. Une sélection
     * vide ne part pas.
     */
    suspend fun markTypesAsRead(types: Collection<String>): NetworkResult<Int> {
        var marked = 0
        for (batch in NotificationTypeSelection.readBatches(types)) {
            val result = markScopeAsRead(NotificationReadBulkScope(kind = "types", types = batch.types)) {
                notificationApi.markTypesAsRead(batch)
            }
            when (result) {
                is NetworkResult.Success -> marked += result.data
                is NetworkResult.Failure -> return result
            }
        }
        return NetworkResult.Success(marked)
    }

    private suspend fun consumeOnce(
        key: String,
        blank: Boolean,
        scope: NotificationReadBulkScope,
        call: suspend () -> MarkReadResponse,
    ): NetworkResult<Int> {
        if (blank || !consumptionsInFlight.add(key)) return NetworkResult.Success(0)
        return try {
            markScopeAsRead(scope, call)
        } finally {
            consumptionsInFlight.remove(key)
        }
    }

    /**
     * Optimiste : les lignes du cache que [scope] désigne (la MÊME loi que `notification:read-bulk`,
     * [notificationMatchesReadBulkScope]) passent à lues avant l'appel, et le retour arrière est CIBLÉ
     * sur ces seules lignes (jamais une restauration de l'instantané, qui écraserait une arrivée du
     * socket pendant le vol) — même forme que [markAllAsRead].
     */
    private suspend fun markScopeAsRead(
        scope: NotificationReadBulkScope,
        call: suspend () -> MarkReadResponse,
    ): NetworkResult<Int> {
        val flipped = _notificationsCache.value.orEmpty()
            .filter { !it.state.isRead && notificationMatchesReadBulkScope(scope, it) }
            .mapTo(HashSet()) { it.id }
        if (flipped.isNotEmpty()) {
            rewriteAll { list -> list.map { if (it.id in flipped) it.copy(state = it.state.copy(isRead = true)) else it } }
            _unreadCount.update { (it - flipped.size).coerceAtLeast(0) }
        }

        val result = rawApiCall { call().count ?: 0 }
        if (result is NetworkResult.Failure && flipped.isNotEmpty()) {
            val reverted = _notificationsCache.value.orEmpty()
                .filter { it.id in flipped && it.state.isRead }
                .mapTo(HashSet()) { it.id }
            rewriteAll { list -> list.map { if (it.id in reverted) it.copy(state = it.state.copy(isRead = false)) else it } }
            _unreadCount.update { it + reverted.size }
        }
        return result
    }

    /**
     * Le compteur est demandé EN MÊME TEMPS que la liste et posé AVANT elle : écrire le cache
     * relance `transformLatest` de [notificationsStream], qui annule le bloc en cours — un
     * `unreadCount()` demandé après la liste était annulé 3 ms après l'envoi (#13354).
     *
     * #18915 (AND-05) — la relecture ouvre son journal AVANT ses requêtes : ce qui arrive ou se lit
     * pendant son vol ([prependLive], [rewriteAll]) y est inscrit, et la page atterrit par-dessus
     * ([landPage]) au lieu d'écraser la liste et le compteur.
     */
    private suspend fun revalidateNotifications(onError: (Throwable) -> Unit = {}) = coroutineScope {
        val flight = openFlight()
        try {
            val count = async { unreadCount() }
            val page = pagedApiCall { notificationApi.list(0, PAGE_SIZE, null) }
            val countResult = count.await()
            val servedUnread = when (countResult) {
                is NetworkResult.Success -> countResult.data
                is NetworkResult.Failure -> null
            }
            when (page) {
                is NetworkResult.Success -> landPage(flight, page.data.data, page.data.pagination, servedUnread)
                is NetworkResult.Failure -> {
                    servedUnread?.let { landCount(flight, it) }
                    onError(Exception(page.error.message))
                }
            }
        } finally {
            closeFlight(flight)
        }
    }

    private fun openFlight(): Flight = synchronized(flightLock) {
        flightCount += 1
        flights = flights + (flightCount to NotificationFlightChanges.NONE)
        Flight(flightCount, epoch)
    }

    private fun closeFlight(flight: Flight) {
        synchronized(flightLock) { flights = flights - flight.id }
    }

    /**
     * The page lands over the journal of its flight in ONE critical section: an arrival or a read
     * can never slip between reading the journal and writing the list. The count goes first (see
     * [revalidateNotifications]). A page of the account that left ([clear] since the flight opened)
     * lands nothing.
     */
    private fun landPage(flight: Flight, items: List<ApiNotification>, pagination: Pagination?, servedUnread: Int?) {
        synchronized(flightLock) {
            if (flight.epoch != epoch) return
            val changes = flights[flight.id] ?: NotificationFlightChanges.NONE
            flights = flights - flight.id
            val landing = NotificationFlightLanding.land(items, servedUnread, _notificationsCache.value, changes)
            landing.unreadCount?.let { _unreadCount.value = it }
            _hasMore.value = pagination?.hasMore ?: false
            _nextCursor.value = pagination?.nextCursor
            _notificationsCache.value = landing.items
            _notificationsSyncedAt.value = clock.nowMillis()
        }
    }

    /** The count a failed re-read still obtained — posed only while its account is the one signed in. */
    private fun landCount(flight: Flight, servedUnread: Int) {
        synchronized(flightLock) { if (flight.epoch == epoch) _unreadCount.value = servedUnread }
    }

    /**
     * The one write of the « all » list that may change a read state: during a re-read's flight,
     * the ids whose read state it flips are journaled, so the page built before cannot undo them.
     * A list not loaded yet is left as it is.
     */
    private fun rewriteAll(transform: (List<ApiNotification>) -> List<ApiNotification>) {
        synchronized(flightLock) {
            val before = _notificationsCache.value ?: return
            val after = transform(before)
            _notificationsCache.value = after
            if (flights.isEmpty()) return
            val flips = NotificationFlightChanges.readFlips(before, after)
            if (flips.isNotEmpty()) flights = flights.mapValues { (_, changes) -> changes.readChanged(flips) }
        }
    }

    /**
     * Resets this per-process singleton to its cold-start state — called from
     * [me.meeshy.sdk.session.SessionTeardown.wipe] on logout/account-switch so a
     * second account signing in on the same device never inherits the previous
     * account's cached notifications or unread count.
     */
    fun clear() {
        synchronized(flightLock) {
            _notificationsCache.value = null
            _notificationsSyncedAt.value = null
            _unreadCount.value = 0
            _hasMore.value = false
            _nextCursor.value = null
            scopedLists.clear()
            epoch += 1
            flights = emptyMap()
            lastPersisted = null
            hydrated = false
        }
        if (store !== NoNotificationCacheStore) {
            pendingDiskClear = persistScope.launch {
                try {
                    store.clear()
                } catch (cancelled: kotlinx.coroutines.CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    // Le disque est un confort ; la barrière de compte l'a de toute façon purgé.
                }
            }
        }
    }

    /**
     * Relit une fois la portée « all » du disque dans le cache en mémoire, AVANT la première émission : le premier cadre
     * porte les lignes en cache. Sans effet si une liste est déjà là (révalidation arrivée la première).
     */
    private suspend fun hydrateOnce() {
        if (hydrated) return
        hydration.withLock {
            if (hydrated) return
            pendingDiskClear?.join()
            val loaded = try {
                store.read()?.withinRetention()
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                null
            }
            synchronized(flightLock) {
                if (loaded != null && _notificationsCache.value == null) {
                    lastPersisted = loaded
                    _hasMore.value = loaded.hasMore
                    _nextCursor.value = loaded.nextCursor
                    if (_unreadCount.value == 0) _unreadCount.value = loaded.unreadCount
                    _notificationsSyncedAt.value = loaded.syncedAt
                    _notificationsCache.value = loaded.items
                }
                hydrated = true
            }
        }
    }

    /** Rétention et plafond du disque (24 h, 200) : une liste plus vieille que la fenêtre n'est pas rejouée. */
    private fun PersistedNotifications.withinRetention(): PersistedNotifications? {
        val policy = CachePolicy.Notifications
        val age = syncedAt?.let { clock.nowMillis() - it }
        if (age != null && age > policy.keepForMillis) return null
        val cap = policy.maxItemCount ?: return this
        return if (items.size <= cap) this else copy(items = items.take(cap), nextCursor = null, hasMore = true)
    }

    @OptIn(FlowPreview::class)
    private fun startPersisting() {
        combine(_notificationsCache, _notificationsSyncedAt, _unreadCount, _hasMore, _nextCursor) { items, syncedAt, unread, hasMore, cursor ->
            items?.let { PersistedNotifications(it, cursor, hasMore, unread, syncedAt) }
        }
            .debounce(PERSIST_DEBOUNCE_MILLIS)
            .onEach { snapshot ->
                if (snapshot == null || snapshot == lastPersisted) return@onEach
                val written = epoch
                pendingDiskClear?.join()
                if (written != epoch) return@onEach
                try {
                    store.write(snapshot) { written == epoch }
                    if (written == epoch) lastPersisted = snapshot
                } catch (cancelled: kotlinx.coroutines.CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    // Le disque est un confort : l'écran continue de servir la mémoire.
                }
            }
            .launchIn(persistScope)
    }

    private companion object {
        const val PAGE_SIZE = 30
        const val PERSIST_DEBOUNCE_MILLIS = 200L
        const val INVALID_ARGUMENT = "INVALID_ARGUMENT"
    }
}
