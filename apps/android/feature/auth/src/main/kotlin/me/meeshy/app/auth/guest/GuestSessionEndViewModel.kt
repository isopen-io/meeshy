package me.meeshy.app.auth.guest

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.guest.GuestSessionEnd
import me.meeshy.sdk.net.GuestSessionEndNotifier
import me.meeshy.sdk.net.GuestSessionEndSignal
import me.meeshy.sdk.session.AnonymousSessionRefresher
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.socket.SocketServerError

/** La fin d'une session d'invite, avec un compteur : deux fins successives de meme cause restent deux evenements. */
data class GuestSessionEnded(val end: GuestSessionEnd, val sequence: Int)

/**
 * Ecoute les refus qui terminent la session d'un invite de lien — REST (intercepteur) et socket (`error`) — purge l'appareil
 * en entier ([AuthRepository.endGuestSession]) puis expose [ended], que la racine presente a la place du fil (iOS
 * `endGuestSession` + `GuestSessionEndedView`). Un refus socket vise le jeton presente au handshake de SA socket, jamais
 * la session ouverte depuis. Un refus que la purge ecarte (session deja quittee, compte inscrit) ne
 * montre rien.
 *
 * Au démarrage à froid avec une session d'invité détenue, un rafraîchissement part ([verifyHeldSession]) : un accès retiré
 * ou un lien échu pendant que l'app était fermée se dit tout de suite, pas au premier refus (#13529).
 */
@HiltViewModel
class GuestSessionEndViewModel internal constructor(
    ends: Flow<GuestSessionEndSignal>,
    socketErrors: Flow<SocketServerError>,
    private val purge: suspend (refusedToken: String?) -> Boolean,
    private val verifyHeldSession: suspend () -> GuestSessionEndSignal? = { null },
) : ViewModel() {

    @Inject
    constructor(
        notifier: GuestSessionEndNotifier,
        socket: SocketManager,
        authRepository: AuthRepository,
        refresher: AnonymousSessionRefresher,
    ) : this(
        ends = notifier.ends,
        socketErrors = socket.serverErrors,
        purge = authRepository::endGuestSession,
        verifyHeldSession = { if (authRepository.hasAccountSession) null else refresher.heldSessionEnd() },
    )

    private val _ended = MutableStateFlow<GuestSessionEnded?>(null)
    val ended: StateFlow<GuestSessionEnded?> = _ended.asStateFlow()

    private var sequence = 0

    init {
        val fromSocket = socketErrors.mapNotNull { error ->
            val token = error.guestSessionToken ?: return@mapNotNull null
            GuestSessionEnd.fromSocketPayload(error.payload)?.let { GuestSessionEndSignal(it, refusedToken = token) }
        }
        viewModelScope.launch {
            merge(ends, fromSocket).collect(::settle)
        }
        viewModelScope.launch { verifyHeldSession()?.let { settle(it) } }
    }

    private suspend fun settle(signal: GuestSessionEndSignal) {
        if (purge(signal.refusedToken)) _ended.value = GuestSessionEnded(signal.end, ++sequence)
    }

    /** « Retour a l'accueil », ou un nouveau lien ouvert : l'ecran se referme. */
    fun dismiss() {
        _ended.value = null
    }
}
