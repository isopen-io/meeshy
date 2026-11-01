package me.meeshy.app.upgrade

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.net.UpgradeRequirement
import me.meeshy.sdk.net.UpgradeRequiredNotifier
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.socket.SocketServerError

/**
 * La porte de version (iOS `UpgradeGateController`) : deux entrées, UN état. Le 426 vécu côté REST arrive par
 * [UpgradeRequiredNotifier] (collant : un refus arrivé avant l'hôte n'est pas perdu) ; l'événement socket `error`
 * `UPGRADE_REQUIRED` du handshake y est versé. Il n'y a donc qu'un chemin vers l'écran, donc qu'un chemin à éprouver.
 * Le serveur ferme la socket après l'avoir émis : le transport ne boucle pas de lui-même.
 */
@HiltViewModel
class UpgradeRequiredViewModel internal constructor(
    private val notifier: UpgradeRequiredNotifier,
    socketErrors: Flow<SocketServerError>,
) : ViewModel() {

    @Inject
    constructor(notifier: UpgradeRequiredNotifier, socket: SocketManager) : this(notifier, socket.serverErrors)

    val requirement: StateFlow<UpgradeRequirement?> = notifier.required

    init {
        viewModelScope.launch {
            socketErrors
                .mapNotNull { UpgradeRequirement.fromSocketPayload(it.payload) }
                .collect(notifier::notifyRequired)
        }
    }
}
