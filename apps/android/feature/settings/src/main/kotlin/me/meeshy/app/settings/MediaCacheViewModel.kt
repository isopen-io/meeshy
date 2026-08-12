package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaCacheReport
import javax.inject.Inject

/** Why a media-cache action failed — localized by the screen, not the ViewModel. */
enum class MediaCacheError { SCAN, CLEAR }

/**
 * Immutable UI state for the media-cache screen (feature-parity §L).
 *
 * [report] is `null` only before the very first scan (cold start → skeleton); every later refresh
 * keeps the previous report visible (stale-while-revalidate). [clearing] holds the categories whose
 * delete is in flight, so the screen can show per-row progress and disable re-taps.
 */
data class MediaCacheUiState(
    val report: MediaCacheReport? = null,
    val isLoading: Boolean = false,
    val clearing: Set<MediaCacheCategory> = emptySet(),
    val error: MediaCacheError? = null,
) {
    val isClearing: Boolean get() = clearing.isNotEmpty()

    /** Clear-all is offered only when something is cached and no delete is already running. */
    val canClear: Boolean get() = report?.isEmpty == false && !isClearing
}

/**
 * Drives the media-cache screen: scans the on-disk caches through [MediaCacheStore], surfaces the
 * per-category sizes and the total, and clears categories on demand (all at once or one at a time —
 * surpassing iOS, which offers only a single "clear all" and shows no sizes).
 *
 * A clear is **optimistic**: the requested categories are zeroed in state immediately (snapshot kept
 * for rollback), the disk delete runs, then a re-scan reconciles. Clearing a category that already
 * holds nothing is inert, a second clear while one is in flight is ignored, and any failure rolls the
 * report back and raises a targeted [MediaCacheError]. `viewModelScope` work rethrows
 * [CancellationException] so a torn-down scope never leaves a spurious error.
 */
@HiltViewModel
class MediaCacheViewModel @Inject constructor(
    private val store: MediaCacheStore,
) : ViewModel() {

    private val _state = MutableStateFlow(MediaCacheUiState(isLoading = true))
    val state: StateFlow<MediaCacheUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val report = store.report()
                _state.update { it.copy(report = report, isLoading = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.update { it.copy(isLoading = false, error = MediaCacheError.SCAN) }
            }
        }
    }

    fun clearAll() {
        val report = _state.value.report ?: return
        clearCategories(report.nonEmptyCategories.toSet())
    }

    fun clear(category: MediaCacheCategory) {
        clearCategories(setOf(category))
    }

    private fun clearCategories(categories: Set<MediaCacheCategory>) {
        val snapshot = _state.value
        if (snapshot.isClearing) return
        val report = snapshot.report ?: return
        val target = categories.filterTo(mutableSetOf()) { report.bytesFor(it) > 0L }
        if (target.isEmpty()) return

        _state.update {
            it.copy(report = report.withCleared(target), clearing = target, error = null)
        }
        viewModelScope.launch {
            try {
                store.clear(target)
                val fresh = store.report()
                _state.update { it.copy(report = fresh, clearing = emptySet()) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.update {
                    it.copy(report = report, clearing = emptySet(), error = MediaCacheError.CLEAR)
                }
            }
        }
    }
}
