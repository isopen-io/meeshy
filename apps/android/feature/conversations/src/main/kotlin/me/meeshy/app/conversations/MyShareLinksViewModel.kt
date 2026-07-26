package me.meeshy.app.conversations

import androidx.annotation.VisibleForTesting
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.sdk.model.MyShareLinksPhase
import me.meeshy.sdk.model.MyShareLinksState
import me.meeshy.sdk.model.ShareLinkExpiration
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

    init {
        load()
    }

    /** Shareable join URL for [link] under the resolved [webOrigin]. */
    fun joinUrlFor(link: MyShareLink): String = link.joinUrl(webOrigin)

    fun load() {
        _state.update { it.loading() }
        viewModelScope.launch {
            try {
                val links = repository.listMyLinks()
                val stats = repository.fetchMyStats()
                _state.update { current ->
                    when (links) {
                        is NetworkResult.Success -> current.loaded(links.data, stats.getOrNull())
                        is NetworkResult.Failure -> current.failed(links.error.message)
                    }
                }
            } catch (e: CancellationException) {
                throw e
            }
        }
    }

    fun toggleActive(link: MyShareLink) {
        val snapshot = _state.value
        _state.update { it.toggled(link.linkId) }
        viewModelScope.launch {
            try {
                val result = repository.setActive(link.linkId, !link.isActive)
                if (result is NetworkResult.Failure) {
                    _state.value = snapshot.failed(result.error.message)
                }
            } catch (e: CancellationException) {
                throw e
            }
        }
    }

    fun delete(link: MyShareLink) {
        val snapshot = _state.value
        _state.update { it.removed(link.linkId) }
        viewModelScope.launch {
            try {
                val result = repository.delete(link.linkId)
                if (result is NetworkResult.Failure) {
                    _state.value = snapshot.failed(result.error.message)
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
        viewModelScope.launch {
            try {
                val result = repository.extend(link.linkId, expiresAtIso)
                if (result is NetworkResult.Failure) {
                    _state.value = snapshot.failed(result.error.message)
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
