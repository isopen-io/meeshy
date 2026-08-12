package me.meeshy.app.conversations

import androidx.annotation.VisibleForTesting
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ShareLinkDetailState
import me.meeshy.sdk.model.auth.ServerEnvironmentResolver
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.sharelink.ShareLinkRepository
import javax.inject.Inject

/**
 * Orchestrates the per-link share-link detail screen on top of the pure
 * [ShareLinkDetailState] reducer and [ShareLinkRepository] — the Android take on iOS
 * `ShareLinkDetailView`.
 *
 * There is no per-link owner endpoint (the owner counters `currentUses` / `maxUses`
 * live only in the list payload), so this resolves its [me.meeshy.sdk.model.MyShareLink]
 * out of the fetched owner list by its public `linkId` (the nav argument). A cold open
 * shows a spinner until the fetch answers; a linkId absent from the list is surfaced as
 * not-found rather than an endless spinner (mirror of `PostDetailViewModel`). Toggle
 * applies optimistically and rolls back to the snapshot on network failure (Instant-App);
 * delete raises the `isDeleted` signal so the screen pops back to a coherent place.
 */
@HiltViewModel
class ShareLinkDetailViewModel @Inject constructor(
    private val repository: ShareLinkRepository,
    config: MeeshyConfig,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val linkId: String = savedStateHandle[LINK_ID_ARG] ?: ""

    /** Public web origin (e.g. `https://meeshy.me`) for user-facing join links. */
    val webOrigin: String =
        ServerEnvironmentResolver.webOrigin(
            ServerEnvironmentResolver.serverOrigin(config.apiBaseUrl),
        )

    /** Injectable at the edge so the expiry predicate stays deterministic in tests. */
    @VisibleForTesting
    internal var now: () -> Long = { System.currentTimeMillis() }

    private val _state = MutableStateFlow(ShareLinkDetailState())
    val state: StateFlow<ShareLinkDetailState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.update { it.loading() }
        viewModelScope.launch {
            try {
                when (val result = repository.listMyLinks()) {
                    is NetworkResult.Success ->
                        _state.update { it.resolved(result.data, linkId, webOrigin, now()) }

                    is NetworkResult.Failure ->
                        _state.update { it.failed(result.error.message) }
                }
            } catch (e: CancellationException) {
                throw e
            }
        }
    }

    /**
     * Optimistically flip the link's active flag, then confirm with the server; a
     * network failure rolls back to the snapshot and surfaces the error. Inert when no
     * link is resolved.
     */
    fun toggleActive() {
        val current = _state.value.link ?: return
        val snapshot = _state.value
        val newActive = !current.isActive
        _state.update { it.toggled() }
        viewModelScope.launch {
            try {
                val result = repository.setActive(current.linkId, newActive)
                if (result is NetworkResult.Failure) {
                    _state.value = snapshot.failed(result.error.message)
                }
            } catch (e: CancellationException) {
                throw e
            }
        }
    }

    /**
     * Delete the link. On success raises the `isDeleted` signal (the screen pops back to
     * the list); on failure surfaces the error and stays on the detail. Inert when no
     * link is resolved.
     */
    fun delete() {
        val current = _state.value.link ?: return
        viewModelScope.launch {
            try {
                when (val result = repository.delete(current.linkId)) {
                    is NetworkResult.Success -> _state.update { it.markDeleted() }
                    is NetworkResult.Failure -> _state.update { it.failed(result.error.message) }
                }
            } catch (e: CancellationException) {
                throw e
            }
        }
    }

    /** Dismiss a surfaced error without a reload (returns to the loaded detail). */
    fun dismissError() {
        _state.update { it.dismissError() }
    }

    companion object {
        const val LINK_ID_ARG: String = "linkId"
    }
}
