package me.meeshy.app.settings

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.lock.ConversationLockStore
import me.meeshy.sdk.model.lock.LockPinEffect
import me.meeshy.sdk.model.lock.LockPinOracle
import me.meeshy.sdk.model.lock.LockPinResult
import me.meeshy.sdk.model.lock.LockPinReducer
import me.meeshy.sdk.model.lock.LockPinState
import me.meeshy.sdk.model.lock.LockSectionAction
import me.meeshy.sdk.model.lock.LockSectionPresentation
import me.meeshy.sdk.model.lock.lockSectionPresentation

@Immutable
data class SecurityLockUiState(
    val presentation: LockSectionPresentation = lockSectionPresentation(hasMasterPin = false, lockCount = 0),
    val prompt: LockPinState? = null,
)

sealed interface SecurityLockUiEvent {
    data class ActionTapped(val action: LockSectionAction) : SecurityLockUiEvent
    data class Digit(val digit: Int) : SecurityLockUiEvent
    data object Delete : SecurityLockUiEvent
    data object DismissPrompt : SecurityLockUiEvent
}

/** Section « Conversations verrouillées » : l'état suit en direct le coffre de verrous, la feuille PIN est pilotée par le réducteur partagé. */
@HiltViewModel
class SecurityLockViewModel @Inject constructor(
    private val lockStore: ConversationLockStore,
) : ViewModel() {

    private val reducer = LockPinReducer(object : LockPinOracle {
        override fun verifyMasterPin(pin: String): Boolean = lockStore.verifyMasterPin(pin)
        override fun verifyLock(conversationId: String, pin: String): Boolean = lockStore.verifyLock(conversationId, pin)
    })

    private val prompt = MutableStateFlow<LockPinState?>(null)

    val state: StateFlow<SecurityLockUiState> = combine(
        lockStore.masterPinConfigured,
        lockStore.lockCount,
        prompt,
    ) { hasPin, count, current ->
        SecurityLockUiState(lockSectionPresentation(hasPin, count), current)
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        SecurityLockUiState(lockSectionPresentation(lockStore.hasMasterPin(), lockStore.lockedConversationIds.size)),
    )

    fun onEvent(event: SecurityLockUiEvent) {
        when (event) {
            is SecurityLockUiEvent.ActionTapped -> {
                val visible = state.value.presentation.actions
                if (event.action in visible) prompt.value = LockPinState(event.action.pinMode, conversationId = null)
            }
            is SecurityLockUiEvent.Digit -> prompt.value?.let { apply(reducer.onDigit(it, event.digit)) }
            SecurityLockUiEvent.Delete -> prompt.update { it?.let(reducer::onDelete) }
            SecurityLockUiEvent.DismissPrompt -> prompt.value = null
        }
    }

    private fun apply(result: LockPinResult) {
        var next: LockPinState? = result.state
        result.effects.forEach { effect ->
            when (effect) {
                is LockPinEffect.CommitMasterPin -> lockStore.setMasterPin(effect.pin)
                LockPinEffect.RemoveMasterPin -> lockStore.removeMasterPin()
                LockPinEffect.RemoveAllLocks -> lockStore.removeAllLocks()
                LockPinEffect.Completed -> next = null
                is LockPinEffect.CommitLock, is LockPinEffect.RemoveLock, is LockPinEffect.OpenConversation -> Unit
            }
        }
        prompt.value = next
    }
}
