package me.meeshy.app.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.publication.PublicationOutbox
import me.meeshy.sdk.publication.UnsentPublication
import javax.inject.Inject

/**
 * « Publications non envoyées » (#13417, iso iOS #13415): every post, reel and story the device
 * holds and the server has not confirmed, read live from the outbox. A failed one is retried
 * (its refused uploads with it), a failed post, reel or story reopens in its composer, and only the
 * author's explicit « Supprimer » removes a publication and its media from the device.
 */
@HiltViewModel
class UnsentPublicationsViewModel @Inject constructor(
    private val publications: PublicationOutbox,
    private val workManager: WorkManager,
    networkMonitor: NetworkMonitor,
) : ViewModel() {

    val items: StateFlow<List<UnsentPublication>> = publications.unsent()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    /** Whether the connection is down: the break told to the author depends on it (wait, not retry). */
    val offline: StateFlow<Boolean> = networkMonitor.isOnline.map { !it }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), !networkMonitor.isOnline.value)

    private val _reopened = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    /** A failed post the author reopened: its draft is back in the post slot, and the composer opens — its scene takes it (#13863). */
    val reopened: SharedFlow<Unit> = _reopened.asSharedFlow()

    private val _reopenedStory = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    /** A failed story the author reopened (#13500): its draft is the story composer's again, which opens on it. */
    val reopenedStory: SharedFlow<Unit> = _reopenedStory.asSharedFlow()

    init {
        viewModelScope.launch { runCatching { publications.releaseSettledDrafts() } }
    }

    fun retry(cmid: String) {
        viewModelScope.launch {
            if (publications.retry(cmid)) workManager.enqueue(OutboxFlushWorker.buildRequest())
        }
    }

    fun discard(cmid: String) {
        viewModelScope.launch { publications.discard(cmid) }
    }

    fun reopen(cmid: String) {
        viewModelScope.launch {
            if (publications.reopenPost(cmid) != null) {
                _reopened.tryEmit(Unit)
                return@launch
            }
            if (publications.reopenStory(cmid) != null) _reopenedStory.tryEmit(Unit)
        }
    }

    private companion object {
        const val STOP_TIMEOUT_MS = 5_000L
    }
}
