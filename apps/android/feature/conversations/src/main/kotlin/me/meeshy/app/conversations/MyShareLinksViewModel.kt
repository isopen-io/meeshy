package me.meeshy.app.conversations

import androidx.annotation.VisibleForTesting
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.sdk.model.MyShareLinksPhase
import me.meeshy.sdk.model.MyShareLinksState
import me.meeshy.sdk.model.ShareLinkExpiration
import me.meeshy.sdk.model.ShareLinksReloadLaw
import me.meeshy.sdk.model.ShareLinksReloadTrigger
import me.meeshy.sdk.model.joinUrl
import me.meeshy.sdk.model.auth.ServerEnvironmentResolver
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.sharelink.ShareLinkRepository
import javax.inject.Inject

/**
 * Orchestrates the user's own share-links management screen on top of the pure
 * [MyShareLinksState] reducer and [ShareLinkRepository]. Loads list + stats in
 * parallel; activate/deactivate and delete apply optimistically and roll back to
 * the snapshot on network failure (Instant-App). The public web origin used to
 * build a shareable [joinUrl] is resolved once from the configured API base URL.
 */
@HiltViewModel
class MyShareLinksViewModel @Inject constructor(
    private val repository: ShareLinkRepository,
    config: MeeshyConfig,
) : ViewModel() {

    private val _state = MutableStateFlow(MyShareLinksState())
    val state: StateFlow<MyShareLinksState> = _state.asStateFlow()

    /** Public web origin (e.g. `https://meeshy.me`) for user-facing join links. */
    val webOrigin: String =
        ServerEnvironmentResolver.webOrigin(
            ServerEnvironmentResolver.serverOrigin(config.apiBaseUrl),
        )

    /** Injectable at the edge so the extended `expiresAt` stays deterministic in tests. */
    @VisibleForTesting
    internal var now: () -> Long = { System.currentTimeMillis() }

    private var loadJob: Job? = null

    init {
        load()
    }

    /** Shareable join URL for [link] under the resolved [webOrigin]. */
    fun joinUrlFor(link: MyShareLink): String = link.joinUrl(webOrigin)

    /** Retour sur l'écran (ex. après une création) : le cache frais dispense du réseau, un cache périmé non. */
    fun onResumed() = load(ShareLinksReloadTrigger.Appear)

    fun refresh() = load(ShareLinksReloadTrigger.PullToRefresh)

    /**
     * Cache-first : la liste en cache est peinte AU PREMIER INSTANT (jamais de spinner sur un
     * cache non vide) ; [ShareLinksReloadLaw] décide ensuite si le serveur est interrogé. Un
     * échec garde la liste précédente sous un bandeau.
     */
    fun load(trigger: ShareLinksReloadTrigger = ShareLinksReloadTrigger.Appear) {
        if (loadJob?.isActive == true && trigger == ShareLinksReloadTrigger.Appear) return
        val cached = repository.cache.read()
        if (cached != null && trigger == ShareLinksReloadTrigger.Appear) {
            _state.update { it.fromCache(cached.links) }
        }
        if (!ShareLinksReloadLaw.mustFetch(trigger, cacheIsFresh = cached?.isFresh == true)) {
            if (_state.value.stats == null) loadStats()
            return
        }
        _state.update { if (trigger == ShareLinksReloadTrigger.Appear) it.loading() else it.refreshing() }
        loadJob = viewModelScope.launch { fetchFromServer() }
    }

    private suspend fun fetchFromServer() {
        try {
            val (links, stats) = coroutineScope {
                val l = async { repository.listMyLinks() }
                val st = async { repository.fetchMyStats() }
                l.await() to st.await()
            }
            val fetched = (links as? NetworkResult.Success)?.data
            _state.update { current ->
                if (fetched == null) {
                    current.failed((links as NetworkResult.Failure).error.message)
                } else {
                    current.loaded(ShareLinksReloadLaw.linksAfterFetch(current.links, fetched), stats.getOrNull())
                }
            }
            if (fetched != null) repository.cache.put(fetched)
        } catch (e: CancellationException) {
            throw e
        }
    }

    private fun loadStats() {
        viewModelScope.launch {
            try {
                repository.fetchMyStats().getOrNull()?.let { stats ->
                    _state.update { it.copy(stats = stats) }
                }
            } catch (e: CancellationException) {
                throw e
            }
        }
    }

    private fun mirrorToCache() = repository.cache.setLinks(_state.value.links)

    fun toggleActive(link: MyShareLink) {
        val snapshot = _state.value
        _state.update { it.toggled(link.linkId) }
        mirrorToCache()
        viewModelScope.launch {
            try {
                val result = repository.setActive(link.linkId, !link.isActive)
                if (result is NetworkResult.Failure) {
                    _state.value = snapshot.failed(result.error.message)
                    mirrorToCache()
                }
            } catch (e: CancellationException) {
                throw e
            }
        }
    }

    fun delete(link: MyShareLink) {
        val snapshot = _state.value
        _state.update { it.removed(link.linkId) }
        mirrorToCache()
        viewModelScope.launch {
            try {
                val result = repository.delete(link.linkId)
                if (result is NetworkResult.Failure) {
                    _state.value = snapshot.failed(result.error.message)
                    mirrorToCache()
                }
            } catch (e: CancellationException) {
                throw e
            }
        }
    }

    /**
     * Extend [link]'s expiry to a new horizon. Applies optimistically and rolls back
     * to the snapshot on network failure (Instant-App). A non-submittable horizon
     * (e.g. [ShareLinkExpiration.Never]) yields no request and is inert — an
     * extend that can't produce a concrete `expiresAt` never touches the network.
     */
    fun extendExpiry(link: MyShareLink, expiration: ShareLinkExpiration) {
        val expiresAtIso = expiration.expiresAtIso(now()) ?: return
        val snapshot = _state.value
        _state.update { it.extended(link.linkId, expiresAtIso) }
        mirrorToCache()
        viewModelScope.launch {
            try {
                val result = repository.extend(link.linkId, expiresAtIso)
                if (result is NetworkResult.Failure) {
                    _state.value = snapshot.failed(result.error.message)
                    mirrorToCache()
                }
            } catch (e: CancellationException) {
                throw e
            }
        }
    }

    /** Dismiss a surfaced error without a reload (returns to the loaded list). */
    fun dismissError() {
        _state.update {
            if (it.errorMessage == null) it else it.copy(errorMessage = null, phase = MyShareLinksPhase.Loaded)
        }
    }
}
