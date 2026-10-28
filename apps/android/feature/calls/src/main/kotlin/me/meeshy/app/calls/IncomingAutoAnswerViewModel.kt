package me.meeshy.app.calls

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import me.meeshy.sdk.call.ActiveCallRepository

/**
 * **« Répondre » ne décroche qu'un appel réellement en cours** (#13504). Le bouton de la notification arrive avec un
 * `callId` ; avant d'ouvrir micro et caméra sans autre geste, la passerelle doit tenir CET appel pour actif dans CETTE
 * conversation ([ActiveCallRepository], qui rend `null` sur tout échec). Sans confirmation — aucun appel, un autre
 * appel, sonde en échec — l'écran d'appel entrant reste affiché et l'utilisateur décroche lui-même.
 */
@HiltViewModel
class IncomingAutoAnswerViewModel @Inject constructor(
    private val activeCalls: ActiveCallRepository,
) : ViewModel() {

    suspend fun confirms(config: CallConfig): Boolean {
        if (config.isOutgoing || config.callId.isBlank() || config.conversationId.isBlank()) return false
        val ongoing = runCatching { activeCalls.activeCallFor(config.conversationId) }.getOrNull() ?: return false
        return ongoing.id == config.callId && ongoing.conversationId == config.conversationId
    }
}
