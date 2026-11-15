package me.meeshy.app.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.lock.ConversationLockStore
import me.meeshy.sdk.lock.ConversationUnlockSessionStore
import me.meeshy.sdk.model.lock.LockPinEffect
import me.meeshy.sdk.model.lock.LockPinMode
import me.meeshy.sdk.model.lock.LockPinOracle
import me.meeshy.sdk.model.lock.LockPinReducer
import me.meeshy.sdk.model.lock.LockPinState
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.displayTitle

/**
 * Porte du fil : une conversation verrouillee par code demande son code quel que soit le chemin
 * d'ouverture (notification, lien profond, recherche, widget, liste). Un code accepte vaut pour la
 * session ([ConversationUnlockSessionStore], memoire, efface a la deconnexion).
 */
@HiltViewModel
class ChatLockGateViewModel @Inject constructor(
    private val lockStore: ConversationLockStore,
    private val unlockSession: ConversationUnlockSessionStore,
    private val conversations: ConversationRepository,
    private val sessionRepository: SessionRepository,
) : ViewModel() {

    private val reducer = LockPinReducer(object : LockPinOracle {
        override fun verifyMasterPin(pin: String): Boolean = lockStore.verifyMasterPin(pin)
        override fun verifyLock(conversationId: String, pin: String): Boolean =
            lockStore.verifyLock(conversationId, pin)
    })

    private val _prompt = MutableStateFlow<LockPinState?>(null)
    val prompt: StateFlow<LockPinState?> = _prompt.asStateFlow()

    private val _conversationName = MutableStateFlow("")
    val conversationName: StateFlow<String> = _conversationName.asStateFlow()

    /** Lecture synchrone : pas d'image du fil avant la decision. */
    fun isAdmitted(conversationId: String): Boolean =
        unlockSession.admits(conversationId, lockStore.isLocked(conversationId))

    fun admitted(conversationId: String): Flow<Boolean> =
        combine(lockStore.lockedConversationIdsFlow, unlockSession.session) { locked, session ->
            session.admits(conversationId, conversationId in locked)
        }

    fun promptFor(conversationId: String): LockPinState =
        _prompt.value ?: LockPinState(LockPinMode.OPEN_CONVERSATION, conversationId)

    fun loadName(conversationId: String) {
        viewModelScope.launch {
            _conversationName.value = conversations.cachedById(conversationId)
                ?.displayTitle(sessionRepository.currentUser.value?.id)
                .orEmpty()
        }
    }

    fun onDigit(conversationId: String, digit: Int) {
        val result = reducer.onDigit(promptFor(conversationId), digit)
        _prompt.value = result.state
        result.effects.forEach { effect ->
            if (effect is LockPinEffect.OpenConversation) unlockSession.unlock(effect.conversationId)
        }
    }

    fun onDelete(conversationId: String) {
        _prompt.update { reducer.onDelete(it ?: LockPinState(LockPinMode.OPEN_CONVERSATION, conversationId)) }
    }
}
