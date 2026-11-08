package me.meeshy.app.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.PublicationCancelOutcome
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.publication.PublicationOutbox
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/**
 * The publications the device holds and the server has not confirmed (#13417, iso iOS #13415), read live from the
 * outbox. Since #14902 (iOS #14879) they read in the feed as the author's own cards, their time replaced by the sending
 * clock: no row, no list. A failed one is retried (its refused uploads with it) or reopened in its composer from the
 * card's menu, and only the author's explicit « Annuler l'envoi » removes a publication and its media from the device.
 */
@HiltViewModel
class UnsentPublicationsViewModel @Inject constructor(
    private val publications: PublicationOutbox,
    private val workManager: WorkManager,
    networkMonitor: NetworkMonitor,
    sessionRepository: SessionRepository,
    config: MeeshyConfig,
) : ViewModel() {

    /** Whether the connection is down: the break told to the author depends on it (wait, not retry). */
    val offline: StateFlow<Boolean> = networkMonitor.isOnline.map { !it }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), !networkMonitor.isOnline.value)

    /** The feed cards of the held publications, newest first — `null` until the outbox has been read once. */
    val cards: StateFlow<List<PendingFeedCard>?> =
        combine(publications.unsent(), offline, sessionRepository.currentUser) { items, isOffline, user ->
            PendingFeedPublications.cards(items, user, config.apiBaseUrl, isOffline)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), null)

    private val _reopened = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    /** A failed post the author reopened: its draft is back in the post slot, and the composer opens — its scene takes it (#13863). */
    val reopened: SharedFlow<Unit> = _reopened.asSharedFlow()

    private val _reopenedStory = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    /** A failed story the author reopened (#13500): its draft is the story composer's again, which opens on it. */
    val reopenedStory: SharedFlow<Unit> = _reopenedStory.asSharedFlow()

    init {
        viewModelScope.launch { runCatching { publications.releaseSettledDrafts() } }
    }

    private val _feedback = Channel<PendingFeedback>(Channel.BUFFERED)

    /** Ce que le fil dit du dernier geste : l'accusé d'une relance, son échec, le sort d'une annulation, un brouillon repris. */
    internal val feedback: Flow<PendingFeedback> = _feedback.receiveAsFlow()

    /** La relance est dite aussitôt (un contrôle sans effet visible n'existe pas) ; la file rend son verdict ensuite. */
    fun retry(cmid: String) {
        viewModelScope.launch {
            _feedback.send(PendingFeedback.RETRY_STARTED)
            val revived = runCatching { publications.retry(cmid) }.getOrDefault(false)
            if (revived) workManager.enqueue(OutboxFlushWorker.buildRequest()) else _feedback.send(PendingFeedback.RETRY_FAILED)
        }
    }

    fun discard(cmid: String) {
        viewModelScope.launch { publications.discard(cmid) }
    }

    /**
     * « Annuler l'envoi » : retirée avant son départ ou marquée en vol, l'envoi est annulé ; sans ligne, elle vient de
     * partir et se supprime une fois en ligne (iOS `withdrawPendingPublication`).
     */
    fun cancelSend(cmid: String) {
        viewModelScope.launch {
            _feedback.send(
                when (publications.cancel(cmid)) {
                    PublicationCancelOutcome.REMOVED, PublicationCancelOutcome.CANCEL_REQUESTED -> PendingFeedback.WITHDRAWN
                    PublicationCancelOutcome.ALREADY_SENT -> PendingFeedback.ALREADY_SENT
                    PublicationCancelOutcome.FAILED -> PendingFeedback.WITHDRAW_FAILED
                },
            )
        }
    }

    /**
     * Ouvre le composeur après avoir repris, s'il est vierge, l'envoi resté bloqué en file : il y revient en brouillon et
     * le fil le dit. Rien n'est écrasé de ce que l'auteur a déjà commencé.
     */
    fun openComposerRecovering(open: () -> Unit) {
        viewModelScope.launch {
            val recovered = runCatching { publications.recoverStuckPost() }.getOrNull()
            if (recovered != null) _feedback.send(PendingFeedback.DRAFT_RECOVERED)
            open()
        }
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
