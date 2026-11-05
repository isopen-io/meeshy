package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.friend.BlockActionCoordinator
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.model.people.BlockEntry
import me.meeshy.sdk.model.people.BlockEntryPlan
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/** Ce que la fiche d'un participant sait du blocage : l'entrée offerte et la confirmation en attente. */
data class ParticipantBlockUiState(
    val entry: BlockEntry? = null,
    val confirming: Boolean = false,
)

sealed interface ParticipantBlockEffect {
    /** Le geste a échoué définitivement : l'état d'avant est restauré, un toast et une haptique d'erreur le disent. */
    data class Failed(val wasBlocking: Boolean) : ParticipantBlockEffect
}

/**
 * Bloquer / débloquer depuis la fiche d'un participant. L'entrée se lit en direct dans [BlockCache] (un geste fait
 * ailleurs la met à jour), la décision de visibilité est la loi pure [BlockEntryPlan], et l'écriture passe par le
 * coordinateur unique : cache à l'instant, file durable (hors ligne compris), retour arrière sur échec définitif.
 */
@HiltViewModel
class ParticipantBlockViewModel @Inject constructor(
    private val blockCache: BlockCache,
    private val blockActions: BlockActionCoordinator,
    private val session: SessionRepository,
) : ViewModel() {

    private data class Subject(val userId: String?, val isAnonymous: Boolean)

    private val subject = MutableStateFlow(Subject(null, false))
    private val confirming = MutableStateFlow(false)
    private val effects = Channel<ParticipantBlockEffect>(Channel.BUFFERED)

    val effectFlow = effects.receiveAsFlow()

    val state: StateFlow<ParticipantBlockUiState> =
        combine(subject, blockCache.version, confirming) { who, _, asking ->
            val entry = BlockEntryPlan.of(
                targetUserId = who.userId,
                selfUserId = session.currentUserId,
                isAnonymous = who.isAnonymous,
                isBlocked = who.userId?.let(blockCache::isBlocked) ?: false,
            )
            ParticipantBlockUiState(entry, confirming = asking && entry == BlockEntry.BLOCK)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ParticipantBlockUiState())

    init {
        viewModelScope.launch {
            blockActions.failures.collect { failure ->
                if (failure.userId == subject.value.userId) effects.send(ParticipantBlockEffect.Failed(failure.wasBlocking))
            }
        }
    }

    /** La personne de la fiche : `null` tant que la fiche n'est pas chargée. */
    fun bind(userId: String?, isAnonymous: Boolean) {
        val next = Subject(userId?.takeIf { it.isNotBlank() }, isAnonymous)
        if (subject.value != next) confirming.value = false
        subject.update { next }
    }

    /** Bloquer demande confirmation ; débloquer part directement. */
    fun onEntryTapped() {
        when (state.value.entry) {
            BlockEntry.BLOCK -> confirming.value = true
            BlockEntry.UNBLOCK -> write(blocked = false)
            null -> Unit
        }
    }

    fun confirmBlock() {
        confirming.value = false
        write(blocked = true)
    }

    fun dismissConfirmation() {
        confirming.value = false
    }

    private fun write(blocked: Boolean) {
        val userId = subject.value.userId ?: return
        viewModelScope.launch {
            try {
                blockActions.setBlocked(userId, blocked)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                effects.send(ParticipantBlockEffect.Failed(wasBlocking = blocked))
            }
        }
    }
}
