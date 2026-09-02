package me.meeshy.app.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/**
 * Donnees reelles du chrome flottant (echelle + bouton avatar) : identite,
 * notifications non lues, demandes d'amitie en attente.
 *
 * [FriendshipCache] et [NotificationRepository.unreadCountStream] sont deja les
 * compteurs corrects, mais aucun des deux n'est amorce avant que l'ecran
 * correspondant ait ete ouvert au moins une fois dans la session — [warmUpIfAuthenticated]
 * les hydrate une seule fois par session authentifiee, jamais avant (pour ne
 * jamais taper l'API non authentifie depuis l'ecran de login) — et se re-arme des
 * qu'une deconnexion est observee, pour qu'un second compte, dans le MEME
 * processus, reamorce ces DEUX singletons plutot que d'en heriter les valeurs.
 */
@HiltViewModel
class ChromeViewModel @Inject constructor(
    sessionRepository: SessionRepository,
    private val notificationRepository: NotificationRepository,
    private val friendRepository: FriendRepository,
    private val friendshipCache: FriendshipCache,
) : ViewModel() {

    val currentUser: StateFlow<MeeshyUser?> = sessionRepository.currentUser

    val unreadNotifications: StateFlow<Int> = notificationRepository.unreadCountStream

    val pendingFriendRequests: StateFlow<Int> = friendshipCache.version
        .map { friendshipCache.pendingReceivedCount }
        .stateIn(viewModelScope, SharingStarted.Eagerly, friendshipCache.pendingReceivedCount)

    private var warmedUp = false

    fun warmUpIfAuthenticated(isAuthenticated: Boolean) {
        if (!isAuthenticated) {
            warmedUp = false
            return
        }
        if (warmedUp) return
        warmedUp = true
        notificationRepository.notificationsStream(onSyncError = {}).launchIn(viewModelScope)
        viewModelScope.launch {
            val received = friendRepository.receivedRequests(offset = 0, limit = FRIENDSHIP_HYDRATION_LIMIT)
            val sent = friendRepository.sentRequests(offset = 0, limit = FRIENDSHIP_HYDRATION_LIMIT)
            if (received is NetworkResult.Success && sent is NetworkResult.Success) {
                friendshipCache.hydrate(sent = sent.data, received = received.data)
            }
        }
    }

    private companion object {
        // Doit rester alignee sur ContactsListViewModel.FETCH_LIMIT (feature:contacts,
        // module distinct, constante privee — dupliquee ici plutot que reference
        // faute d'un point d'hydratation partage en sdk-core) : les deux hydratent
        // le MEME singleton FriendshipCache.hydrate(), qui REMPLACE tout le graphe —
        // une limite plus basse ici tronquerait le graphe d'amitie pour toute l'app
        // tant que l'ecran Contacts n'a pas ete ouvert une fois.
        const val FRIENDSHIP_HYDRATION_LIMIT = 100
    }
}
