package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.relation.BringGateway
import me.meeshy.sdk.relation.BringSendControl
import me.meeshy.sdk.relation.BringSendState

/**
 * Le Bring dans l'en-tête d'un direct (#17442, iso `ConversationHeaderBringButton`) : la MÊME machine d'envoi que la fiche
 * ([BringSendControl]) — le bouton n'existe que si la passerelle sert `available: true`, il annule tant que ça sonne.
 */
@HiltViewModel
class ChatHeaderBringViewModel @Inject constructor(
    gateway: BringGateway,
) : ViewModel() {
    private val control = BringSendControl(gateway, viewModelScope)

    val state: StateFlow<BringSendState> = control.state

    fun load(peerUserId: String) = control.load(peerUserId)

    fun send() = control.send()

    fun cancel() = control.cancel()

    fun consumeNotice() = control.consumeNotice()
}
