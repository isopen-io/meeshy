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
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.friend.observeFriendshipLive
import me.meeshy.sdk.notification.observeNotificationSync
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
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
 *
 * [observeNotificationSync] runs from here too, unconditionally in [init] rather
 * than gated by [warmUpIfAuthenticated]: this ViewModel is app-scoped (unlike
 * `NotificationsViewModel`, torn down with its own screen), so it is the one
 * place that keeps [NotificationRepository]'s cache — and the badge above —
 * moving off-screen. `MessageSocketManager`'s notification flows are
 * `SharedFlow`s with `replay = 0`, so a collector scoped to a single screen
 * misses every event that arrives while that screen is closed.
 */
@HiltViewModel
class ChromeViewModel @Inject constructor(
    private val sessionRepository: SessionRepository,
    private val notificationRepository: NotificationRepository,
    private val friendRepository: FriendRepository,
    private val friendshipCache: FriendshipCache,
    messageSocketManager: MessageSocketManager,
    private val config: MeeshyConfig,
) : ViewModel() {

    val currentUser: StateFlow<MeeshyUser?> = sessionRepository.currentUser

    /** The chrome avatar's loadable address — the stored key resolved against the API base. */
    fun avatarModel(user: MeeshyUser?): String? = chromeAvatarModel(user?.avatar, config.apiBaseUrl)

    val unreadNotifications: StateFlow<Int> = notificationRepository.unreadCountStream

    val pendingFriendRequests: StateFlow<Int> = friendshipCache.version
        .map { friendshipCache.pendingReceivedCount }
        .stateIn(viewModelScope, SharingStarted.Eagerly, friendshipCache.pendingReceivedCount)

    private var warmedUp = false

    init {
        viewModelScope.observeNotificationSync(notificationRepository, messageSocketManager)
        viewModelScope.observeFriendshipLive(friendshipCache, messageSocketManager)
    }

    fun warmUpIfAuthenticated(isAuthenticated: Boolean) {
        if (!isAuthenticated) {
            warmedUp = false
            return
        }
        if (warmedUp) return
        warmedUp = true
        notificationRepository.notificationsStream(onSyncError = {}).launchIn(viewModelScope)
        viewModelScope.launch {
            friendshipCache.hydrateCoalesced(fetch = {
                friendRepository.friendshipGraph(sessionRepository.currentUserId.orEmpty()).getOrNull()
            })
        }
    }
}
