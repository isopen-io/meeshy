package me.meeshy.app.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.model.call.CallLinkRequest
import me.meeshy.sdk.model.call.CallLinkRule
import me.meeshy.sdk.model.call.CallLinkTarget
import me.meeshy.sdk.model.call.CallLinkVerdict
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository

enum class CallLinkRefusal { UNKNOWN_CONTACT, BLOCKED }

sealed interface CallLinkEvent {
    data class Refused(val reason: CallLinkRefusal) : CallLinkEvent

    /** Le SEUL événement qui fait composer : émis par le geste « Appeler », avec la cible exacte que la feuille montrait. */
    data class Dial(val target: CallLinkTarget) : CallLinkEvent
}

/**
 * **Le lien d'appel DEMANDE, il ne compose pas** — miroir de `CallLinkConfirmationController` (iOS, #13465).
 *
 * [request] prépare la confirmation ; [confirm] est le SEUL chemin qui compose : le geste « Appeler » sur la feuille qui
 * montrait `shown`. Il compose EXACTEMENT `shown` — jamais l'état courant — et seulement si cette feuille est toujours
 * celle affichée et que ni le compte ni le blocage n'ont changé ; sinon rien ne part et la feuille se ferme. Une feuille
 * REMPLACÉE par un second lien ne referme pas sa remplaçante ([dismissed]).
 *
 * Sans session, rien n'est gardé : se connecter ensuite ne relance aucun appel.
 */
@HiltViewModel
class CallLinkConfirmationViewModel @Inject constructor(
    private val conversations: ConversationRepository,
    private val blocks: BlockCache,
    private val sessions: SessionRepository,
) : ViewModel() {

    private val _pending = MutableStateFlow<CallLinkTarget?>(null)
    val pending: StateFlow<CallLinkTarget?> = _pending.asStateFlow()

    private val _events = MutableSharedFlow<CallLinkEvent>(extraBufferCapacity = 4, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val events: SharedFlow<CallLinkEvent> = _events.asSharedFlow()

    private var nextToken = 1L

    fun request(request: CallLinkRequest) {
        val account = sessions.currentUserId ?: return
        viewModelScope.launch {
            val conversation = conversations.cachedById(request.conversationId)
                ?: (conversations.getById(request.conversationId) as? NetworkResult.Success)?.data
            // Le compte a pu changer pendant la résolution : rien ne s'affiche.
            if (sessions.currentUserId != account) return@launch
            when (val verdict = CallLinkRule.resolve(request, conversation, account, blocks::isBlocked)) {
                is CallLinkVerdict.Confirm -> _pending.value = verdict.target.copy(token = nextToken++)
                CallLinkVerdict.UnknownContact -> _events.tryEmit(CallLinkEvent.Refused(CallLinkRefusal.UNKNOWN_CONTACT))
                CallLinkVerdict.Blocked -> _events.tryEmit(CallLinkEvent.Refused(CallLinkRefusal.BLOCKED))
            }
        }
    }

    fun confirm(shown: CallLinkTarget) {
        if (_pending.value != shown) return
        _pending.value = null
        if (CallLinkRule.mayDial(shown, sessions.currentUserId, blocks.isBlocked(shown.userId))) {
            _events.tryEmit(CallLinkEvent.Dial(shown))
        }
    }

    /** La feuille qui montrait [shown] s'est fermée (Annuler, glissé vers le bas). Une feuille remplacée ne referme pas sa remplaçante. */
    fun dismissed(shown: CallLinkTarget) {
        if (_pending.value == shown) _pending.value = null
    }
}
