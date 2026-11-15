package me.meeshy.app.calls

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

/** Le pont de l'écran d'appel entrant vers [CallDeclineMessenger] : l'envoi survit à l'écran. */
@HiltViewModel
class CallDeclineReplyViewModel @Inject constructor(
    private val messenger: CallDeclineMessenger,
) : ViewModel() {
    fun send(peerId: String, conversationId: String, text: String) =
        messenger.sendInBackground(peerId, conversationId, text)
}
