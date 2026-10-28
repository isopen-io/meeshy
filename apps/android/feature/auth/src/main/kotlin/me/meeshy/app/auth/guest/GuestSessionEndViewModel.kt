package me.meeshy.app.auth.guest

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.guest.GuestSessionEnd
import me.meeshy.sdk.net.GuestSessionEndNotifier
import me.meeshy.sdk.net.GuestSessionEndSignal
import me.meeshy.sdk.socket.SocketManager

/** La fin d'une session d'invite, avec un compteur : deux fins successives de meme cause restent deux evenements. */
data class GuestSessionEnded(val end: GuestSessionEnd, val sequence: Int)

/**
 * Ecoute les refus qui terminent la session d'un invite de lien — REST (intercepteur) et socket (`error`) — purge l'appareil
 * en entier ([AuthRepository.endGuestSession]) puis expose [ended], que la racine presente a la place du fil (iOS
 * `endGuestSession` + `GuestSessionEndedView`). Un refus que la purge ecarte (session deja quittee, compte inscrit) ne
 * montre rien.
 */
@HiltViewModel
class GuestSessionEndViewModel internal constructor(
    ends: Flow<GuestSessionEndSignal>,
    socketErrors: Flow<String>,
    private val purge: suspend (refusedToken: String?) -> Boolean,
) : ViewModel() {

    @Inject
    constructor(
        notifier: GuestSessionEndNotifier,
        socket: SocketManager,
        authRepository: AuthRepository,
    ) : this(notifier.ends, socket.socketErrors, authRepository::endGuestSession)

    private val _ended = MutableStateFlow<GuestSessionEnded?>(null)
    val ended: StateFlow<GuestSessionEnded?> = _ended.asStateFlow()

    private var sequence = 0

    init {
        val fromSocket = socketErrors.mapNotNull { GuestSessionEnd.fromSocketPayload(it) }
            .map { GuestSessionEndSignal(it, refusedToken = null) }
        viewModelScope.launch {
            merge(ends, fromSocket).collect { signal ->
                if (purge(signal.refusedToken)) _ended.value = GuestSessionEnded(signal.end, ++sequence)
            }
        }
    }

    /** « Retour a l'accueil », ou un nouveau lien ouvert : l'ecran se referme. */
    fun dismiss() {
        _ended.value = null
    }
}
