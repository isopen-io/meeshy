package me.meeshy.app.calls

import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.model.call.CallAudioRouteKind
import me.meeshy.sdk.model.call.TelecomDisconnectCause
import me.meeshy.sdk.model.call.TelecomSystemDisconnectKind

/** Une sortie audio vue par le système ; [token] est l'objet plateforme à lui rendre pour la choisir. */
data class TelecomEndpoint(val kind: CallAudioRouteKind, val token: Any)

/**
 * Ce que l'application peut faire sur UNE connexion système ouverte : le miroir, sans type
 * `androidx.core.telecom`, de `CallControlScope`. Chaque méthode rend vrai si le système l'a acceptée.
 */
interface TelecomCallControl {
    suspend fun answer(isVideo: Boolean): Boolean
    suspend fun setActive(): Boolean
    suspend fun disconnect(cause: TelecomDisconnectCause): Boolean
    suspend fun requestEndpoint(endpoint: TelecomEndpoint): Boolean

    val isMuted: Flow<Boolean>
    val currentEndpoint: Flow<TelecomEndpoint?>
    val availableEndpoints: Flow<List<TelecomEndpoint>>
}

/** Ce que le système demande, rappelé depuis son interface (casque, montre, voiture, écran verrouillé). */
class TelecomCallHandlers(
    val onAnswer: suspend () -> Unit,
    val onDisconnect: suspend (TelecomSystemDisconnectKind) -> Unit,
    val onSetActive: suspend () -> Unit,
    val onSetInactive: suspend () -> Unit,
)

/** La couture vers `CallsManager.addCall` : suspend tant que la connexion système vit. */
interface TelecomCallsGateway {
    suspend fun addCall(info: TelecomCallInfo, handlers: TelecomCallHandlers, block: suspend TelecomCallControl.() -> Unit)
}
